# Tasks

> For maintainers. Using Tasks? See [the user guide](../user/tasks.md).

Tasks are an environment-owned orchestration aggregate. A server persists task events in the normal
event log and projects current state into `projection_tasks`; no client or MCP handler writes that
table directly. Migration 48 creates the additive projection, so older databases replay safely and
existing threads, provider cursors, and credentials remain untouched.

The wire model keeps `tasks` optional on shell and full snapshots for compatibility with older
servers and cached snapshots. New servers always emit the array. Shell stream events upsert or remove
individual tasks, which avoids sending a full workspace snapshot for each drag, completion, or edit.

Task links are nullable references to a project and thread on the same server. The decider validates
both links and their relationship. Project or thread deletion emits a task update that clears the
affected link before the owning aggregate is deleted; it never cascades task deletion.

Each connected environment owns its own task projection. `packages/client-runtime` scopes task IDs
with `EnvironmentId` and aggregates the per-server snapshots for desktop and mobile presentation.
Commands always return to the environment that supplied the task.

Desktop exposes `/tasks` only inside Electron and provides checklist, Kanban drag/reorder, and the
nearest-due footer card. Mobile uses the same synchronized state with checklist and horizontally
scrolling Kanban views, long-press movement, and accessibility actions. Browser-only clients decode
and synchronize tasks but do not expose the desktop route.

Agent task tools require both a thread-scoped `task-management` capability and the current Agent
profile's `allowTaskManagement` setting. The handler derives the environment and Agent thread from
the credential and delegates validation and persistence to the orchestration engine.
