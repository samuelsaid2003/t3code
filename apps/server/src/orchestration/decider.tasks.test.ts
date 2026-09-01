import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const NOW = "2026-09-01T00:00:00.000Z";
const projectId = ProjectId.make("project-tasks");
const threadId = ThreadId.make("thread-tasks");
const taskId = TaskId.make("task-one");

const projectCreated: OrchestrationEvent = {
  sequence: 1,
  eventId: EventId.make("event-project-tasks"),
  aggregateKind: "project",
  aggregateId: projectId,
  type: "project.created",
  occurredAt: NOW,
  commandId: CommandId.make("command-project-tasks"),
  causationEventId: null,
  correlationId: null,
  metadata: {},
  payload: {
    projectId,
    title: "Task project",
    workspaceRoot: "/tmp/task-project",
    defaultModelSelection: null,
    scripts: [],
    createdAt: NOW,
    updatedAt: NOW,
  },
};

const projectResult = Effect.fn("tasksTest.projectResult")(function* (
  model: OrchestrationReadModel,
  event: Omit<OrchestrationEvent, "sequence"> | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
) {
  let next = model;
  let sequence = model.snapshotSequence;
  for (const entry of Array.isArray(event) ? event : [event]) {
    sequence += 1;
    next = yield* projectEvent(next, { ...entry, sequence });
  }
  return next;
});

const seedModel = Effect.gen(function* () {
  let model = yield* projectEvent(createEmptyReadModel(NOW), projectCreated);
  const created = yield* decideOrchestrationCommand({
    readModel: model,
    command: {
      type: "thread.create",
      commandId: CommandId.make("command-thread-tasks"),
      threadId,
      projectId,
      title: "Task thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.6",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: NOW,
    },
  });
  model = yield* projectResult(model, created);
  return model;
});

it.layer(NodeServices.layer)("task decider", (it) => {
  it.effect("creates, completes, reopens, and deletes a linked task", () =>
    Effect.gen(function* () {
      let model = yield* seedModel;
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "task.create",
          commandId: CommandId.make("command-task-create"),
          taskId,
          title: "Ship Tasks",
          status: "todo",
          threadId,
          createdAt: NOW,
        },
      });
      model = yield* projectResult(model, created);
      expect(model.tasks?.[0]).toMatchObject({
        id: taskId,
        projectId,
        threadId,
        status: "todo",
        completedAt: null,
      });

      const completed = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "task.move",
          commandId: CommandId.make("command-task-complete"),
          taskId,
          status: "done",
          position: 0,
        },
      });
      model = yield* projectResult(model, completed);
      expect(model.tasks?.[0]?.status).toBe("done");
      expect(model.tasks?.[0]?.completedAt).not.toBeNull();

      const reopened = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "task.move",
          commandId: CommandId.make("command-task-reopen"),
          taskId,
          status: "in_progress",
          position: 2,
        },
      });
      model = yield* projectResult(model, reopened);
      expect(model.tasks?.[0]).toMatchObject({
        status: "in_progress",
        position: 2,
        completedAt: null,
      });

      const deleted = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "task.delete",
          commandId: CommandId.make("command-task-delete"),
          taskId,
        },
      });
      model = yield* projectResult(model, deleted);
      expect(model.tasks).toEqual([]);
    }),
  );

  it.effect("keeps tasks while clearing links when their thread and project are deleted", () =>
    Effect.gen(function* () {
      let model = yield* seedModel;
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "task.create",
          commandId: CommandId.make("command-linked-task-create"),
          taskId,
          title: "Keep this task",
          threadId,
          createdAt: NOW,
        },
      });
      model = yield* projectResult(model, created);

      const threadDeleted = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "thread.delete",
          commandId: CommandId.make("command-linked-thread-delete"),
          threadId,
        },
      });
      expect(
        (Array.isArray(threadDeleted) ? threadDeleted : [threadDeleted]).map((event) => event.type),
      ).toEqual(["task.updated", "thread.deleted"]);
      model = yield* projectResult(model, threadDeleted);
      expect(model.tasks?.[0]).toMatchObject({ projectId, threadId: null });

      const projectDeleted = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "project.delete",
          commandId: CommandId.make("command-linked-project-delete"),
          projectId,
        },
      });
      expect(
        (Array.isArray(projectDeleted) ? projectDeleted : [projectDeleted]).map(
          (event) => event.type,
        ),
      ).toEqual(["task.updated", "project.deleted"]);
      model = yield* projectResult(model, projectDeleted);
      expect(model.tasks?.[0]).toMatchObject({ projectId: null, threadId: null });
    }),
  );

  it.effect("rejects empty titles and missing links", () =>
    Effect.gen(function* () {
      const model = yield* seedModel;
      const emptyTitle = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.create",
            commandId: CommandId.make("command-empty-task"),
            taskId,
            title: "   ",
            createdAt: NOW,
          },
        }),
      );
      expect(emptyTitle.message).toContain("cannot be empty");

      const missingThread = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.create",
            commandId: CommandId.make("command-missing-link"),
            taskId,
            title: "Invalid link",
            threadId: ThreadId.make("missing-thread"),
            createdAt: NOW,
          },
        }),
      );
      expect(missingThread.message).toContain("does not exist");
    }),
  );
});
