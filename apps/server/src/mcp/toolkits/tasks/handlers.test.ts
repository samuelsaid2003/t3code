import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationTask,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { taskManagementHandlers } from "./handlers.ts";

const threadId = ThreadId.make("agent-task-manager");
const environmentId = EnvironmentId.make("environment-tasks");

const invocation = (capabilities: ReadonlySet<McpInvocationContext.McpCapability>) =>
  McpInvocationContext.McpInvocationContext.of({
    environmentId,
    threadId,
    providerSessionId: "provider-session-tasks",
    providerInstanceId: ProviderInstanceId.make("codex"),
    capabilities,
    issuedAt: 1,
  });

function agentThread(allowTaskManagement: boolean): OrchestrationThread {
  return {
    id: threadId,
    projectId: ProjectId.make("project-tasks"),
    kind: "agent",
    parentThreadId: null,
    agentProfile: { instructions: "Manage the work.", allowTaskManagement },
    agentRoutines: [],
    agentRuns: [],
    title: "Task manager",
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

const queryFor = (
  getThread: () => OrchestrationThread,
  getTasks: () => ReadonlyArray<OrchestrationTask>,
) =>
  ProjectionSnapshotQuery.of({
    getThreadDetailById: () => Effect.succeed(Option.some(getThread())),
    getShellSnapshot: () =>
      Effect.succeed({
        snapshotSequence: 1,
        projects: [],
        threads: [],
        tasks: getTasks(),
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
  } as unknown as ProjectionSnapshotQuery["Service"]);

it.effect("denies task tools unless both credential and current profile permit them", () =>
  Effect.gen(function* () {
    const missingCapability = yield* taskManagementHandlers.task_list({}).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation(new Set())),
      Effect.provideService(
        ProjectionSnapshotQuery,
        queryFor(
          () => agentThread(true),
          () => [],
        ),
      ),
      Effect.flip,
    );
    expect(missingCapability._tag).toBe("PreviewAutomationUnavailableError");

    const disabledProfile = yield* taskManagementHandlers.task_list({}).pipe(
      Effect.provideService(
        McpInvocationContext.McpInvocationContext,
        invocation(new Set(["task-management"])),
      ),
      Effect.provideService(
        ProjectionSnapshotQuery,
        queryFor(
          () => agentThread(false),
          () => [],
        ),
      ),
      Effect.flip,
    );
    expect(disabledProfile._tag).toBe("TaskManagementToolError");
  }),
);

it.effect("creates a task through the orchestration command path", () => {
  const tasks: OrchestrationTask[] = [];
  const engine = OrchestrationEngineService.of({
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        if (command.type !== "task.create") {
          throw new Error(`Unexpected command ${command.type}`);
        }
        tasks.push({
          id: command.taskId,
          title: command.title,
          notes: command.notes ?? null,
          status: command.status ?? "backlog",
          dueAt: command.dueAt ?? null,
          projectId: command.projectId ?? null,
          threadId: command.threadId ?? null,
          position: command.position ?? 0,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
          completedAt: null,
        });
        return { sequence: 2 };
      }),
  } as unknown as OrchestrationEngineService["Service"]);

  return Effect.gen(function* () {
    const task = yield* taskManagementHandlers.task_create({
      title: "  Prepare release  ",
      status: "todo",
      dueAt: null,
    });
    expect(task).toMatchObject({
      id: TaskId.make(task.id),
      title: "Prepare release",
      status: "todo",
      dueAt: null,
    });
  }).pipe(
    Effect.provideService(
      McpInvocationContext.McpInvocationContext,
      invocation(new Set(["task-management"])),
    ),
    Effect.provideService(
      ProjectionSnapshotQuery,
      queryFor(
        () => agentThread(true),
        () => tasks,
      ),
    ),
    Effect.provideService(OrchestrationEngineService, engine),
    Effect.provide(NodeServices.layer),
  );
});
