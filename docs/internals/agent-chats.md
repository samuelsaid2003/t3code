# Agent Chats

> For maintainers. Using Agent Chats? See [the user guide](../user/agent-chats.md).

Agent Chats are a navigation layer over ordinary T3 orchestration. Desktop owns creation and
routine management; desktop and mobile both expose the durable conversation. The feature
deliberately does not introduce another agent runtime, scheduler process, or concurrency model.

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
are excluded from ordinary thread navigation. The Electron renderer exposes them through `/agents`;
browser clients redirect that route to the normal workspace.

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

Mobile treats Threads and Agents as presentation-only selectors over the complete synchronized
thread collection. Home and the iPad sidebar use a native segmented control; Agent mode is a flat
recently-updated list without pending tasks, lifecycle shelves, swipe actions, or creation controls.
The selected mode is in memory and starts in Threads on a cold launch. Only the scoped key of the
last Agent Chat is persisted. On iPad each mode restores its own most recent selection; on iPhone
switching modes replaces the list without navigating into a chat.

Agent Chats reuse the normal mobile thread route and feed. Opening one updates the remembered key,
including when navigation came from a deep link. Agent model, provider options, runtime access, and
interaction changes persist immediately; standard threads retain save-on-send behavior. A failed
Agent setting update restores the optimistic selection. Routine trigger messages are removed only
while building the rendered feed, leaving synchronization, storage, history windows, cursors,
outbox delivery, assistant responses, tools, and diffs untouched.

## Deliberate constraints

- The desktop app must be open for schedules to fire.
- There is no additional locking, queueing, or worktree allocation for overlap; routines are normal
  turns on their Agent Chat.
- Scheduling is time-based only. External triggers and connectors are outside this feature.
- Mobile does not create or manage Agent Chats or routines, and it does not register for Agent run
  push notifications in the first Samuel TestFlight release. Results synchronize when it reconnects.
