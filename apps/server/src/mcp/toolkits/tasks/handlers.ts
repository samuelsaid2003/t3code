import { CommandId, TaskId, type OrchestrationTask } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { TaskManagementToolkit, TaskManagementToolError } from "./tools.ts";

const toolError = (operation: string, cause: unknown) =>
  new TaskManagementToolError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  });

const uuid = Crypto.Crypto.pipe(
  Effect.flatMap((crypto) => crypto.randomUUIDv4),
  Effect.orDie,
);
const commandId = (operation: string) =>
  uuid.pipe(Effect.map((value) => CommandId.make(`mcp:${operation}:${value}`)));

const requireAgent = Effect.fn("TaskManagementToolkit.requireAgent")(function* (operation: string) {
  const scope = yield* McpInvocationContext.requireMcpCapability("task-management");
  const query = yield* ProjectionSnapshotQuery;
  const option = yield* query
    .getThreadDetailById(scope.threadId)
    .pipe(Effect.mapError((cause) => toolError(operation, cause)));
  const thread = Option.getOrNull(option);
  if (
    thread === null ||
    thread.kind !== "agent" ||
    thread.agentProfile?.allowTaskManagement !== true
  ) {
    return yield* toolError(operation, "Task management is not enabled for this Agent Chat.");
  }
  return { scope, query };
});

const dispatch = Effect.fn("TaskManagementToolkit.dispatch")(function* (
  operation: string,
  command: Parameters<OrchestrationEngineService["Service"]["dispatch"]>[0],
) {
  const engine = yield* OrchestrationEngineService;
  yield* engine.dispatch(command).pipe(Effect.mapError((cause) => toolError(operation, cause)));
});

const getTask = Effect.fn("TaskManagementToolkit.getTask")(function* (
  operation: string,
  taskId: TaskId,
) {
  const query = yield* ProjectionSnapshotQuery;
  const snapshot = yield* query
    .getShellSnapshot()
    .pipe(Effect.mapError((cause) => toolError(operation, cause)));
  const task = (snapshot.tasks ?? []).find((entry) => entry.id === taskId);
  if (!task) return yield* toolError(operation, `Task '${taskId}' was not found.`);
  return task;
});

function nextPosition(
  tasks: ReadonlyArray<OrchestrationTask>,
  status: OrchestrationTask["status"],
) {
  return Math.max(
    0,
    ...tasks.filter((task) => task.status === status).map((task) => task.position + 1),
  );
}

export const taskManagementHandlers = {
  task_list: (input) =>
    Effect.gen(function* () {
      const { query } = yield* requireAgent("task_list");
      const snapshot = yield* query
        .getShellSnapshot()
        .pipe(Effect.mapError((cause) => toolError("task_list", cause)));
      return {
        tasks: (snapshot.tasks ?? [])
          .filter((task) => input.status === undefined || task.status === input.status)
          .toSorted((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
      };
    }),
  task_create: (input) =>
    Effect.gen(function* () {
      const { query } = yield* requireAgent("task_create");
      const snapshot = yield* query
        .getShellSnapshot()
        .pipe(Effect.mapError((cause) => toolError("task_create", cause)));
      const taskId = TaskId.make(yield* uuid);
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      const status = input.status ?? "backlog";
      yield* dispatch("task_create", {
        ...input,
        type: "task.create",
        commandId: yield* commandId("task_create"),
        taskId,
        title: input.title.trim(),
        status,
        position: nextPosition(snapshot.tasks ?? [], status),
        createdAt,
      });
      return yield* getTask("task_create", taskId);
    }),
  task_update: (input) =>
    Effect.gen(function* () {
      yield* requireAgent("task_update");
      yield* dispatch("task_update", {
        ...input,
        type: "task.update",
        commandId: yield* commandId("task_update"),
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
      });
      return yield* getTask("task_update", input.taskId);
    }),
  task_move: (input) =>
    Effect.gen(function* () {
      const { query } = yield* requireAgent("task_move");
      const snapshot = yield* query
        .getShellSnapshot()
        .pipe(Effect.mapError((cause) => toolError("task_move", cause)));
      yield* dispatch("task_move", {
        type: "task.move",
        commandId: yield* commandId("task_move"),
        taskId: input.taskId,
        status: input.status,
        position: input.position ?? nextPosition(snapshot.tasks ?? [], input.status),
      });
      return yield* getTask("task_move", input.taskId);
    }),
  task_complete: (input) =>
    Effect.gen(function* () {
      const { query } = yield* requireAgent("task_complete");
      const snapshot = yield* query
        .getShellSnapshot()
        .pipe(Effect.mapError((cause) => toolError("task_complete", cause)));
      const status = input.completed === false ? "todo" : "done";
      yield* dispatch("task_complete", {
        type: "task.move",
        commandId: yield* commandId("task_complete"),
        taskId: input.taskId,
        status,
        position: nextPosition(snapshot.tasks ?? [], status),
      });
      return yield* getTask("task_complete", input.taskId);
    }),
  task_delete: (input) =>
    Effect.gen(function* () {
      yield* requireAgent("task_delete");
      yield* dispatch("task_delete", {
        type: "task.delete",
        commandId: yield* commandId("task_delete"),
        taskId: input.taskId,
      });
      return { taskId: input.taskId, deleted: true };
    }),
} satisfies Parameters<typeof TaskManagementToolkit.toLayer>[0];

export const TaskManagementToolkitHandlersLive =
  TaskManagementToolkit.toLayer(taskManagementHandlers);
