import {
  AgentRunId,
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const projectId = ProjectId.make("project-agent");
const agentId = ThreadId.make("agent-thread");

const projectCreated: OrchestrationEvent = {
  sequence: 1,
  eventId: EventId.make("event-project-agent"),
  aggregateKind: "project",
  aggregateId: projectId,
  type: "project.created",
  occurredAt: now,
  commandId: CommandId.make("command-project-agent"),
  causationEventId: null,
  correlationId: null,
  metadata: {},
  payload: {
    projectId,
    title: "Agent project",
    workspaceRoot: "/tmp/agent-project",
    defaultModelSelection: null,
    scripts: [],
    createdAt: now,
    updatedAt: now,
  },
};

it.layer(NodeServices.layer)("agent chat decider", (it) => {
  it.effect("creates an agent, schedules a routine, and anchors its run to a message", () =>
    Effect.gen(function* () {
      let model = yield* projectEvent(createEmptyReadModel(now), projectCreated);
      const created = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "thread.create",
          commandId: CommandId.make("command-agent-create"),
          threadId: agentId,
          projectId,
          kind: "agent",
          agentProfile: { instructions: "Own the release process." },
          title: "Release captain",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.6",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: now,
        },
      });
      const createdEvent = Array.isArray(created) ? created[0]! : created;
      model = yield* projectEvent(model, { ...createdEvent, sequence: 2 });
      expect(model.threads[0]?.kind).toBe("agent");
      expect(model.threads[0]?.agentProfile?.instructions).toBe("Own the release process.");

      const scheduled = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "thread.agent-routine.upsert",
          commandId: CommandId.make("command-routine-create"),
          threadId: agentId,
          routine: {
            id: "routine-release",
            name: "Release check",
            prompt: "Check release readiness.",
            enabled: true,
            schedule: {
              kind: "once",
              at: "2100-01-01T09:00:00.000Z",
              timeZone: "UTC",
            },
          },
        },
      });
      const scheduledEvent = Array.isArray(scheduled) ? scheduled[0]! : scheduled;
      model = yield* projectEvent(model, { ...scheduledEvent, sequence: 3 });
      expect(model.threads[0]?.agentRoutines?.[0]?.nextRunAt).toBe("2100-01-01T09:00:00.000Z");
      const runId = AgentRunId.make("run-release");
      const messageId = MessageId.make("run-message");
      const requested = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          type: "thread.agent-run.request",
          commandId: CommandId.make("command-run-request"),
          threadId: agentId,
          routineId: "routine-release",
          runId,
          messageId,
          scheduledFor: "2100-01-01T09:00:00.000Z",
          createdAt: "2100-01-01T09:00:00.000Z",
        },
      });
      const requestedEvent = Array.isArray(requested) ? requested[0]! : requested;
      model = yield* projectEvent(model, { ...requestedEvent, sequence: 4 });
      expect(model.threads[0]?.agentRuns?.[0]).toMatchObject({
        id: runId,
        status: "running",
        messageId,
      });
      expect(model.threads[0]?.agentRoutines?.[0]?.enabled).toBe(false);
    }),
  );
});
