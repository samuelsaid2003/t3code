import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const NOW = "2026-08-30T00:00:00.000Z";
const projectId = ProjectId.make("side-project");
const parentId = ThreadId.make("side-parent");
const childId = ThreadId.make("side-child");
const providerInstanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId: providerInstanceId, model: "gpt-5.6" };

const projectPlanned = Effect.fnUntraced(function* (
  readModel: OrchestrationReadModel,
  planned:
    | Omit<OrchestrationEvent, "sequence">
    | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
) {
  let next = readModel;
  for (const event of Array.isArray(planned) ? planned : [planned]) {
    next = yield* projectEvent(next, { ...event, sequence: next.snapshotSequence + 1 });
  }
  return next;
});

const seedReadModel = Effect.gen(function* () {
  let model = yield* projectEvent(createEmptyReadModel(NOW), {
    sequence: 1,
    eventId: EventId.make("side-project-created"),
    aggregateKind: "project",
    aggregateId: projectId,
    type: "project.created",
    occurredAt: NOW,
    commandId: CommandId.make("side-project-create"),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: {
      projectId,
      title: "Side project",
      workspaceRoot: "/tmp/side-project",
      defaultModelSelection: null,
      scripts: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
  const parentCreated = yield* decideOrchestrationCommand({
    readModel: model,
    command: {
      type: "thread.create",
      commandId: CommandId.make("side-parent-create"),
      threadId: parentId,
      projectId,
      kind: "standard",
      title: "Parent",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "main",
      worktreePath: "/tmp/side-project",
      createdAt: NOW,
    },
  });
  model = yield* projectPlanned(model, parentCreated);
  const sessionSet = yield* decideOrchestrationCommand({
    readModel: model,
    command: {
      type: "thread.session.set",
      commandId: CommandId.make("side-parent-session"),
      threadId: parentId,
      session: {
        threadId: parentId,
        status: "ready",
        providerName: "codex",
        providerInstanceId,
        runtimeMode: "full-access",
        activeTurnId: null,
        lastError: null,
        updatedAt: NOW,
      },
      createdAt: NOW,
    },
  });
  return yield* projectPlanned(model, sessionSet);
});

function sideCreate(threadId = childId): OrchestrationCommand {
  return {
    type: "thread.create",
    commandId: CommandId.make(`create-${threadId}`),
    threadId,
    projectId,
    kind: "side",
    parentThreadId: parentId,
    title: "Side chat",
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: "/tmp/side-project",
    createdAt: NOW,
  };
}

it.layer(NodeServices.layer)("side chat decider", (it) => {
  it.effect("creates one inherited side child and persists its parent relation", () =>
    Effect.gen(function* () {
      const model = yield* seedReadModel;
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: sideCreate(),
      });
      const event = Array.isArray(created) ? created[0]! : created;
      expect(event.type).toBe("thread.created");
      if (event.type === "thread.created") {
        expect(event.payload).toMatchObject({
          kind: "side",
          parentThreadId: parentId,
          title: "Side chat",
        });
      }

      const withChild = yield* projectPlanned(model, created);
      const duplicateError = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: withChild,
          command: sideCreate(ThreadId.make("second-side-child")),
        }),
      );
      expect(duplicateError.message).toContain("already has an open side chat");
    }),
  );

  it.effect("rejects side children that do not exactly inherit parent settings", () =>
    Effect.gen(function* () {
      const model = yield* seedReadModel;
      const command = sideCreate();
      if (command.type !== "thread.create") return;
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: { ...command, branch: "different" },
        }),
      );
      expect(error.message).toContain("must copy their parent thread configuration");
    }),
  );

  it.effect("deletes the side child first when its parent is deleted", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: sideCreate(),
      });
      model = yield* projectPlanned(model, created);
      const deleted = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "thread.delete",
          commandId: CommandId.make("delete-side-parent"),
          threadId: parentId,
        },
      });
      const events = Array.isArray(deleted) ? deleted : [deleted];
      expect(events.map((event) => [event.type, event.aggregateId])).toEqual([
        ["thread.deleted", childId],
        ["thread.deleted", parentId],
      ]);
    }),
  );

  it.effect("rejects ordinary lifecycle controls for side threads", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: sideCreate(),
      });
      model = yield* projectPlanned(model, created);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "thread.archive",
            commandId: CommandId.make("archive-side"),
            threadId: childId,
          },
        }),
      );
      expect(error.message).toContain("does not support lifecycle controls");
    }),
  );
});
