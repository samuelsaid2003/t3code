import {
  IsoDateTime,
  OrchestrationTask,
  PreviewAutomationUnavailableError,
  ProjectId,
  TaskId,
  TaskStatus,
  ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  OrchestrationEngineService,
  ProjectionSnapshotQuery,
  Crypto.Crypto,
];

export class TaskManagementToolError extends Schema.TaggedErrorClass<TaskManagementToolError>()(
  "TaskManagementToolError",
  { operation: Schema.String, message: Schema.String },
) {}

const TaskFailure = Schema.Union([TaskManagementToolError, PreviewAutomationUnavailableError]);
const TaskListResult = Schema.Struct({ tasks: Schema.Array(OrchestrationTask) });
const TaskDeleteResult = Schema.Struct({ taskId: TaskId, deleted: Schema.Boolean });

export const TaskListTool = Tool.make("task_list", {
  description: "List tasks in this Agent Chat's environment.",
  parameters: Schema.Struct({ status: Schema.optionalKey(TaskStatus) }),
  success: TaskListResult,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const TaskCreateTool = Tool.make("task_create", {
  description: "Create a durable task in this Agent Chat's environment.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
    notes: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(20_000)))),
    status: Schema.optionalKey(TaskStatus),
    dueAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
    projectId: Schema.optionalKey(Schema.NullOr(ProjectId)),
    threadId: Schema.optionalKey(Schema.NullOr(ThreadId)),
  }),
  success: OrchestrationTask,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const TaskUpdateTool = Tool.make("task_update", {
  description: "Update a task's title, notes, due date, or links. Omitted fields stay unchanged.",
  parameters: Schema.Struct({
    taskId: TaskId,
    title: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500))),
    notes: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(20_000)))),
    dueAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
    projectId: Schema.optionalKey(Schema.NullOr(ProjectId)),
    threadId: Schema.optionalKey(Schema.NullOr(ThreadId)),
  }),
  success: OrchestrationTask,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const TaskMoveTool = Tool.make("task_move", {
  description: "Move a task to another status and position.",
  parameters: Schema.Struct({
    taskId: TaskId,
    status: TaskStatus,
    position: Schema.optionalKey(Schema.Number),
  }),
  success: OrchestrationTask,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const TaskCompleteTool = Tool.make("task_complete", {
  description: "Mark a task complete or reopen it in Todo.",
  parameters: Schema.Struct({ taskId: TaskId, completed: Schema.optionalKey(Schema.Boolean) }),
  success: OrchestrationTask,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const TaskDeleteTool = Tool.make("task_delete", {
  description: "Permanently delete a task from this environment.",
  parameters: Schema.Struct({ taskId: TaskId }),
  success: TaskDeleteResult,
  failure: TaskFailure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false);

export const TaskManagementToolkit = Toolkit.make(
  TaskListTool,
  TaskCreateTool,
  TaskUpdateTool,
  TaskMoveTool,
  TaskCompleteTool,
  TaskDeleteTool,
);
