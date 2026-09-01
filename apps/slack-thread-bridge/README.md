# The General — Slack ↔ T3 bridge

This local bridge gives Samuel a private two-way Slack conversation with one
existing T3 Agent Chat. Slack messages become normal turns on that exact T3
thread; the final assistant response is posted back to the originating Slack
conversation. Completed scheduled routines and routine attention requests from
the bound Agent Chat are proactively sent to Samuel's DM.

There is no hosted agent and no separate OpenAI API conversation. Slack Socket
Mode and T3's authenticated WebSocket API are both outbound connections from
the Mac, so no public webhook or Vercel deployment is required.

## Prerequisites

- The T3 desktop app must be open for turns and scheduled routines to run.
- Use an Agent Chat for the bound thread if scheduled routines are required.
- The first version accepts text DMs only. Approvals and structured user-input
  requests remain in T3.

## 1. Create the private Slack app

1. In Slack app management, create an app **from a manifest** and paste
   `slack-app-manifest.yaml`.
2. Under **Basic Information → App-Level Tokens**, create a token with
   `connections:write`. This is the `xapp-…` token.
3. Install the app to the TradeWiz workspace and copy its `xoxb-…` bot token.
4. Copy Samuel's Slack member ID from his profile.

The bot needs only `chat:write`, `im:history`, `im:read`, `im:write`, and
`reactions:write`. Slack's native streaming message APIs use `chat:write`; the
reaction scope powers the queued, streaming, delivered, and failed status marks.
It ignores every Slack user except `SLACK_ALLOWED_USER_ID`.

## 2. Configure the bridge

```bash
cd /Users/samuelsaid/t3-code/apps/slack-thread-bridge
cp .env.example .env
chmod 600 .env
```

Fill in both Slack tokens, Samuel's member ID, and the T3 thread ID. The thread
ID is the final segment of an open Agent Chat URL:

```text
/agents/<environment-id>/<thread-id>
```

`.env`, scoped T3 credentials, and runtime logs are ignored by Git.

## 3. Pair the bridge with the running T3 environment

From the T3 repository, mint a five-minute pairing URL for the live desktop
environment:

```bash
cd /Users/samuelsaid/t3-code
node apps/server/src/bin.ts pair --base-dir /Users/samuelsaid/.t3-samuel --label "TradeWiz Slack bridge"
```

Then consume it locally without putting the token in shell history:

```bash
pnpm --filter @tradewiz/slack-thread-bridge pair:t3
```

Paste the full pairing URL when prompted. The bridge requests only
`orchestration:read` and `orchestration:operate` and stores the resulting
30-day bearer credential in `state/t3-auth.json` with mode `0600`. Re-run these
two commands when that credential expires or is revoked.

## 4. Verify, then keep it running

Foreground smoke test:

```bash
pnpm --filter @tradewiz/slack-thread-bridge start
```

Send the bot a DM and confirm the user message and answer both appear in the
same T3 Agent Chat. Stop the foreground process, then install the LaunchAgent:

```bash
pnpm --filter @tradewiz/slack-thread-bridge launchd:install
```

The LaunchAgent restarts the bridge after failures and waits 30 seconds between
attempts. It does not start T3 itself. Logs live under `apps/slack-thread-bridge/logs/`.

To stop and remove it:

```bash
pnpm --filter @tradewiz/slack-thread-bridge launchd:uninstall
```

If the integration is being retired rather than paused, also revoke the
`TradeWiz Slack bridge` client in T3's connection settings and remove the local
`.env` and `state/t3-auth.json` files.

## Delivery behavior

- Slack event IDs become stable T3 command and message IDs, making Slack retry
  delivery idempotent.
- The bridge tracks T3's ordered turn-start queue, so a Slack message is paired
  with its own provider turn even when another turn is already running.
- T3's visible assistant text is streamed into one Slack response as it is
  emitted, with later deltas batched
  to stay within Slack's API limits. If native streaming fails before creating a
  message, the bridge falls back to the existing split-message delivery. A
  delivery marker is recorded only after the streamed message is finalized or
  every fallback chunk posts, with two bounded retries if T3 is briefly
  unavailable.
- Slack-originated prompts show `hourglass_flowing_sand` while queued and `eyes`
  when assistant text starts. The bridge removes the reaction after successful
  delivery and changes it to `x` after a failed turn. Reaction failures are
  best-effort and never block the T3 turn.
- Once a Slack turn is present, the web, desktop, and mobile timelines offer
  All, T3, and Slack source filters. Filtering changes only what the client
  renders; every turn remains in the durable thread history and provider
  context.
- Only scheduled Agent Chat completion and attention events are proactively
  mirrored. Ordinary turns started in T3 are not duplicated into Slack.
- Delivery is intentionally at-least-once. A process crash after Slack accepts
  a message but before T3 records its receipt can cause that reply to be posted
  again when Slack retries the original event.
