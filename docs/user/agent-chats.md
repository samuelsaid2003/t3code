# Agent Chats

Agent Chats are persistent coding teammates. Each one belongs to a project and keeps its own
standing instructions, model, working mode, conversation, and scheduled routines.

Use the compact **Threads / Agent Chats** switch beside the new-chat button at the top of the
sidebar. The Agent Chats sidebar has the same search, project filter, provider usage, and utility
controls as the Threads sidebar. Opening Agent Chats again restores the Agent Chat you last used.
Switching back restores the exact thread or draft you left.

Choose **New Agent Chat** to create one, then give it a name, project, and standing instructions.
Its chat works like any other T3 thread. Use the Agent panel on the right to revise instructions or
add a routine.

Routines can run once, daily, weekly, or monthly in a chosen time zone. When a routine runs, it uses
the Agent Chat's current model, reasoning effort, access mode, standing instructions, and conversation
history. The desktop app must be open when a routine is due. If several occurrences were missed while
it was closed, T3 runs only the latest missed occurrence on the next launch.

Routine responses appear directly in the Agent Chat without showing the scheduled trigger as a user
message. Tool calls, approvals, diffs, and the agent response remain visible. **Agent Runs** keeps a
compact status history, and T3 sends a desktop notification when a run completes, fails, or needs an
approval or answer.

## On iPhone and iPad

Use the native **Threads / Agents** control at the top of Home or the iPad sidebar. Agents replace
the normal thread list instead of mixing into it. Agent Chats use the full chat experience, including
messages, tools, diffs, approvals, files, terminal access, and composer controls. Model, reasoning,
auto/access, and interaction changes save immediately for an Agent Chat.

The app starts in Threads after a cold launch. It remembers your last Agent Chat independently; on
iPad, returning to Agents reopens it, while iPhone leaves you in the Agent list until you choose one.
Agent creation and routine management remain in the desktop app. The first Samuel iOS release does
not send background routine notifications, so new results appear when the app reconnects. For access
away from the desktop's local network, connect the phone to the desktop host through Tailscale.
