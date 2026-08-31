import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { agentRoutineHandlers, canonicalRoutineSchedule } from "./handlers.ts";

const threadId = ThreadId.make("agent-1");
const invocation = (capabilities: ReadonlySet<McpInvocationContext.McpCapability>) =>
  McpInvocationContext.McpInvocationContext.of({
    environmentId: EnvironmentId.make("environment-1"),
    threadId,
    providerSessionId: "provider-session-1",
    providerInstanceId: ProviderInstanceId.make("codex"),
    capabilities,
    issuedAt: 1,
  });

function agentThread(allowRoutineManagement: boolean): OrchestrationThread {
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    kind: "agent",
    parentThreadId: null,
    agentProfile: { instructions: "Be useful", allowRoutineManagement },
    agentRoutines: [],
    agentRuns: [],
    title: "The General",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    titleRegeneration: null,
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
}

const queryFor = (getThread: () => OrchestrationThread) =>
  ProjectionSnapshotQuery.of({
    getThreadDetailById: () => Effect.succeed(Option.some(getThread())),
  } as unknown as ProjectionSnapshotQuery["Service"]);

describe("canonicalRoutineSchedule", () => {
  it("normalizes friendly daily, weekly, and monthly wall-clock times", () => {
    expect(
      canonicalRoutineSchedule({ kind: "daily", time: "08:05", timeZone: "Australia/Melbourne" }),
    ).toEqual({
      kind: "daily",
      hour: 8,
      minute: 5,
      timeZone: "Australia/Melbourne",
    });
    expect(
      canonicalRoutineSchedule({
        kind: "weekly",
        weekDay: 1,
        time: "17:30",
        timeZone: "UTC",
      }),
    ).toEqual({ kind: "weekly", weekDay: 1, hour: 17, minute: 30, timeZone: "UTC" });
    expect(
      canonicalRoutineSchedule({
        kind: "monthly",
        monthDay: 31,
        time: "23:59",
        timeZone: "UTC",
      }),
    ).toEqual({ kind: "monthly", monthDay: 31, hour: 23, minute: 59, timeZone: "UTC" });
  });

  it("preserves an exact once schedule", () => {
    const schedule = {
      kind: "once" as const,
      at: "2026-09-02T00:00:00.000Z",
      timeZone: "UTC",
    };
    expect(canonicalRoutineSchedule(schedule)).toEqual(schedule);
  });
});

it.effect("denies routine tools unless both credential and current profile permit them", () =>
  Effect.gen(function* () {
    const missingCapability = yield* agentRoutineHandlers.routine_list().pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation(new Set())),
      Effect.provideService(
        ProjectionSnapshotQuery,
        queryFor(() => agentThread(true)),
      ),
      Effect.flip,
    );
    expect(missingCapability._tag).toBe("PreviewAutomationUnavailableError");

    const disabledProfile = yield* agentRoutineHandlers.routine_list().pipe(
      Effect.provideService(
        McpInvocationContext.McpInvocationContext,
        invocation(new Set(["agent-routines"])),
      ),
      Effect.provideService(
        ProjectionSnapshotQuery,
        queryFor(() => agentThread(false)),
      ),
      Effect.flip,
    );
    expect(disabledProfile._tag).toBe("AgentRoutineToolError");
  }),
);

it.effect("creates a normalized routine through the orchestration command path", () => {
  let thread = agentThread(true);
  const engine = OrchestrationEngineService.of({
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        if (command.type !== "thread.agent-routine.upsert") {
          throw new Error(`Unexpected command ${command.type}`);
        }
        thread = {
          ...thread,
          agentRoutines: [
            {
              ...command.routine,
              nextRunAt: "2026-09-02T22:00:00.000Z",
              lastRunAt: null,
              lastStatus: null,
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        };
        return { sequence: 1 };
      }),
  } as unknown as OrchestrationEngineService["Service"]);

  return Effect.gen(function* () {
    const routine = yield* agentRoutineHandlers.routine_create({
      name: "Morning review",
      prompt: "Review the project.",
      schedule: { kind: "daily", time: "09:00", timeZone: "Australia/Melbourne" },
    });

    expect(routine).toMatchObject({
      name: "Morning review",
      enabled: true,
      schedule: { kind: "daily", hour: 9, minute: 0, timeZone: "Australia/Melbourne" },
      nextRunAt: "2026-09-02T22:00:00.000Z",
    });
  }).pipe(
    Effect.provideService(
      McpInvocationContext.McpInvocationContext,
      invocation(new Set(["agent-routines"])),
    ),
    Effect.provideService(
      ProjectionSnapshotQuery,
      queryFor(() => thread),
    ),
    Effect.provideService(OrchestrationEngineService, engine),
    Effect.provide(NodeServices.layer),
  );
});
