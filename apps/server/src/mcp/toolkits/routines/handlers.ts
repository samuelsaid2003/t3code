import {
  AgentRoutineId,
  AgentRunId,
  CommandId,
  MessageId,
  type AgentRoutine,
  type AgentRoutineSchedule,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  AgentRoutineToolkit,
  AgentRoutineToolError,
  type FriendlyRoutineSchedule,
} from "./tools.ts";

const toolError = (operation: string, cause: unknown) =>
  new AgentRoutineToolError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export function canonicalRoutineSchedule(schedule: FriendlyRoutineSchedule): AgentRoutineSchedule {
  if (schedule.kind === "once") return schedule;
  const [hourText, minuteText] = schedule.time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (schedule.kind === "weekly") {
    return { kind: "weekly", weekDay: schedule.weekDay, hour, minute, timeZone: schedule.timeZone };
  }
  if (schedule.kind === "monthly") {
    return {
      kind: "monthly",
      monthDay: schedule.monthDay,
      hour,
      minute,
      timeZone: schedule.timeZone,
    };
  }
  return { kind: "daily", hour, minute, timeZone: schedule.timeZone };
}

const uuid = Crypto.Crypto.pipe(
  Effect.flatMap((crypto) => crypto.randomUUIDv4),
  Effect.orDie,
);
const commandId = (operation: string) =>
  uuid.pipe(Effect.map((value) => CommandId.make(`mcp:${operation}:${value}`)));

const requireAgent = Effect.fn("AgentRoutineToolkit.requireAgent")(function* (operation: string) {
  const scope = yield* McpInvocationContext.requireMcpCapability("agent-routines");
  const query = yield* ProjectionSnapshotQuery;
  const option = yield* query
    .getThreadDetailById(scope.threadId)
    .pipe(Effect.mapError((cause) => toolError(operation, cause)));
  const thread = Option.getOrNull(option);
  if (
    thread === null ||
    thread.kind !== "agent" ||
    thread.agentProfile?.allowRoutineManagement !== true
  ) {
    return yield* toolError(operation, "Routine management is not enabled for this Agent Chat.");
  }
  return { scope, thread };
});

const dispatch = Effect.fn("AgentRoutineToolkit.dispatch")(function* (
  operation: string,
  command: Parameters<OrchestrationEngineService["Service"]["dispatch"]>[0],
) {
  const engine = yield* OrchestrationEngineService;
  return yield* engine
    .dispatch(command)
    .pipe(Effect.mapError((cause) => toolError(operation, cause)));
});

const refreshedRoutine = Effect.fn("AgentRoutineToolkit.refreshedRoutine")(function* (
  operation: string,
  threadId: OrchestrationThread["id"],
  routineId: AgentRoutineId,
) {
  const query = yield* ProjectionSnapshotQuery;
  const option = yield* query
    .getThreadDetailById(threadId)
    .pipe(Effect.mapError((cause) => toolError(operation, cause)));
  const routine = (Option.getOrNull(option)?.agentRoutines ?? []).find(
    (entry) => entry.id === routineId,
  );
  if (!routine) return yield* toolError(operation, `Routine '${routineId}' was not found.`);
  return routine;
});

const upsert = Effect.fn("AgentRoutineToolkit.upsert")(function* (
  operation: string,
  thread: OrchestrationThread,
  routine: Pick<AgentRoutine, "id" | "name" | "prompt" | "enabled" | "schedule">,
) {
  yield* dispatch(operation, {
    type: "thread.agent-routine.upsert",
    commandId: yield* commandId(operation),
    threadId: thread.id,
    routine,
  });
  return yield* refreshedRoutine(operation, thread.id, routine.id);
});

export const agentRoutineHandlers = {
  routine_list: () =>
    requireAgent("routine_list").pipe(
      Effect.map(({ thread }) => ({
        routines: [...(thread.agentRoutines ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      })),
    ),
  routine_create: (input) =>
    Effect.gen(function* () {
      const { thread } = yield* requireAgent("routine_create");
      return yield* upsert("routine_create", thread, {
        id: AgentRoutineId.make(yield* uuid),
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        enabled: input.enabled ?? true,
        schedule: canonicalRoutineSchedule(input.schedule),
      });
    }),
  routine_update: (input) =>
    Effect.gen(function* () {
      const { thread } = yield* requireAgent("routine_update");
      const current = (thread.agentRoutines ?? []).find(
        (routine) => routine.id === input.routineId,
      );
      if (!current) {
        return yield* toolError("routine_update", `Routine '${input.routineId}' was not found.`);
      }
      return yield* upsert("routine_update", thread, {
        id: current.id,
        name: input.name?.trim() ?? current.name,
        prompt: input.prompt?.trim() ?? current.prompt,
        enabled: current.enabled,
        schedule: input.schedule ? canonicalRoutineSchedule(input.schedule) : current.schedule,
      });
    }),
  routine_set_enabled: (input) =>
    Effect.gen(function* () {
      const { thread } = yield* requireAgent("routine_set_enabled");
      const current = (thread.agentRoutines ?? []).find(
        (routine) => routine.id === input.routineId,
      );
      if (!current) {
        return yield* toolError(
          "routine_set_enabled",
          `Routine '${input.routineId}' was not found.`,
        );
      }
      return yield* upsert("routine_set_enabled", thread, {
        id: current.id,
        name: current.name,
        prompt: current.prompt,
        enabled: input.enabled,
        schedule: current.schedule,
      });
    }),
  routine_delete: (input) =>
    Effect.gen(function* () {
      const { thread } = yield* requireAgent("routine_delete");
      yield* dispatch("routine_delete", {
        type: "thread.agent-routine.delete",
        commandId: yield* commandId("routine_delete"),
        threadId: thread.id,
        routineId: input.routineId,
      });
      return { routineId: input.routineId, deleted: true };
    }),
  routine_run_now: (input) =>
    Effect.gen(function* () {
      const { thread } = yield* requireAgent("routine_run_now");
      const routine = (thread.agentRoutines ?? []).find((entry) => entry.id === input.routineId);
      if (!routine) {
        return yield* toolError("routine_run_now", `Routine '${input.routineId}' was not found.`);
      }
      const scheduledFor = DateTime.formatIso(yield* DateTime.now);
      const runId = AgentRunId.make(yield* uuid);
      yield* dispatch("routine_run_now", {
        type: "thread.agent-run.request",
        commandId: yield* commandId("routine_run_now"),
        threadId: thread.id,
        routineId: routine.id,
        runId,
        messageId: MessageId.make(yield* uuid),
        scheduledFor,
        createdAt: scheduledFor,
      });
      return {
        routine: yield* refreshedRoutine("routine_run_now", thread.id, routine.id),
        runId,
        scheduledFor,
      };
    }),
} satisfies Parameters<typeof AgentRoutineToolkit.toLayer>[0];

export const AgentRoutineToolkitHandlersLive = AgentRoutineToolkit.toLayer(agentRoutineHandlers);
