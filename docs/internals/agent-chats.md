# Agent Chats

> For maintainers. Using Agent Chats? See [the user guide](../user/agent-chats.md).

Agent Chats are a desktop-only navigation layer over ordinary T3 orchestration. They deliberately
do not introduce another agent runtime, scheduler process, or concurrency model.

## Domain model

An agent chat is an `OrchestrationThread` with `kind: "agent"` and a durable `agentProfile`.
Manual messages use the normal thread/session/provider/checkpoint pipeline. Immediately before a
message reaches the provider, `ProviderCommandReactor` prepends the current standing instructions;
the stored user message remains unchanged.

Routines are stored on the agent thread as a prompt and schedule. Their schedules use an IANA time
zone and support once, daily, weekly, and monthly recurrence. `AgentRoutineReactor` runs only while
the server bundled with the desktop app is running. At startup it coalesces missed recurrence into
the latest missed occurrence rather than replaying every missed run.

Each routine run starts a normal turn on its owning Agent Chat. It therefore uses that thread's
current model selection, provider options such as reasoning effort, runtime access mode, interaction
mode, standing instructions, provider session, transcript, worktree, and checkpoint pipeline. The
routine prompt is persisted as a message linked to the run so recovery remains idempotent, but the
client omits that trigger message from the timeline. Assistant messages, tool activity, approvals,
and diffs remain visible in the shared conversation.

## Projection and UI

Agent metadata is projected into `projection_threads` as JSON alongside `thread_kind`. Agent threads
are excluded from the ordinary thread navigation. The Electron renderer exposes them through
`/agents`; browser clients redirect that route to the normal workspace.

The Agents sidebar reuses the shared sidebar chrome and footer so environment identification,
provider usage, settings, pull requests, usage, and update controls stay identical to Threads. A
shared segmented control beside the new-chat action switches between the two lists without adding a
footer-only navigation mode. A renderer-local `lastAgentThreadKey` preference records the most
recently opened Agent Chat. The `/agents` index restores that thread when it still exists, falls
back to the most recently updated agent when it does not, and shows creation only when explicitly
requested or no agents exist.

The mode switch navigates directly to remembered concrete routes instead of passing through either
index route. A renderer-local `lastThreadRouteTarget` preference complements `lastAgentThreadKey`,
and both sidebar trees remain mounted while toggling so the large Threads list does not rebuild on
every switch. Hidden sidebars use `display: none`; Settings still replaces the mode sidebar normally.

The parent thread holds a bounded run ledger. Completion, failure, and attention requests update
that ledger, which drives both the Agent Runs panel and desktop notifications. Notifications return
the user to the owning Agent Chat, where the result is already inline.

## Deliberate constraints

- The desktop app must be open for schedules to fire.
- There is no additional locking, queueing, or worktree allocation for overlap; routines are normal
  turns on their Agent Chat.
- Scheduling is time-based only. External triggers, connectors, and web/mobile UI are outside this
  feature.
