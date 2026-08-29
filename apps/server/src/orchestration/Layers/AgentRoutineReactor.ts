import {
  AgentRunId,
  CommandId,
  EventId,
  MessageId,
  type AgentRoutine,
  type AgentRun,
  type OrchestrationEvent,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import { forkParked } from "../../serverActivation.ts";
import { ServerConfig } from "../../config.ts";
import { agentRoutineTurnStartCommand, nextAgentRoutineOccurrence } from "../agentSchedule.ts";
import {
  AgentRoutineReactor,
  type AgentRoutineReactorShape,
} from "../Services/AgentRoutineReactor.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

type RelevantEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.agent-run-requested"
      | "thread.turn-diff-completed"
      | "thread.session-set"
      | "thread.activity-appended";
  }
>;

function latestDueOccurrence(routine: AgentRoutine, nowIso: string): string | null {
  let due = routine.nextRunAt;
  if (due === null || due > nowIso) return null;
  if (routine.schedule.kind === "once") return due;

  for (let index = 0; index < 10_000; index += 1) {
    const next = nextAgentRoutineOccurrence(routine.schedule, due);
    if (next === null || next > nowIso) return due;
    due = next;
  }
  return due;
}

function assistantSummary(thread: OrchestrationThread, run: AgentRun): string | undefined {
  const message = thread.messages.findLast(
    (entry) =>
      entry.role === "assistant" &&
      !entry.streaming &&
      entry.createdAt >= run.startedAt &&
      entry.text.trim().length > 0,
  );
  if (message === undefined) return undefined;
  const normalized = message.text.replace(/\s+/g, " ").trim();
  return normalized.length > 320 ? `${normalized.slice(0, 319)}…` : normalized;
}

const make = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const crypto = yield* Crypto.Crypto;
  const config = yield* ServerConfig;

  const uuid = crypto.randomUUIDv4;
  const commandId = (label: string) =>
    uuid.pipe(
      Effect.orDie,
      Effect.map((value) => CommandId.make(`server:${label}:${value}`)),
    );

  const completeRun = Effect.fn("AgentRoutineReactor.completeRun")(function* (input: {
    readonly agent: OrchestrationThread;
    readonly routine: AgentRoutine;
    readonly run: AgentRun;
    readonly status: "completed" | "failed";
    readonly summary?: string;
    readonly error?: string;
    readonly completedAt: string;
  }) {
    if (input.run.status !== "running") return;
    yield* engine.dispatch({
      type: "thread.agent-run.complete",
      commandId: yield* commandId("agent-run-complete"),
      threadId: input.agent.id,
      routineId: input.routine.id,
      runId: input.run.id,
      status: input.status,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      completedAt: input.completedAt,
    });

    yield* engine.dispatch({
      type: "thread.activity.append",
      commandId: yield* commandId("agent-run-activity"),
      threadId: input.agent.id,
      activity: {
        id: EventId.make(yield* uuid.pipe(Effect.orDie)),
        tone: input.status === "completed" ? "info" : "error",
        kind: input.status === "completed" ? "agent.routine.completed" : "agent.routine.failed",
        summary:
          input.status === "completed"
            ? `${input.routine.name} completed`
            : `${input.routine.name} failed`,
        payload: {
          runId: input.run.id,
          routineId: input.routine.id,
          ...(input.run.messageId !== undefined ? { messageId: input.run.messageId } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
        },
        turnId: null,
        createdAt: input.completedAt,
      },
      createdAt: input.completedAt,
    });
  });

  const ensureAgentRunTurn = Effect.fn("AgentRoutineReactor.ensureAgentRunTurn")(function* (input: {
    readonly agent: OrchestrationThread;
    readonly routine: AgentRoutine;
    readonly run: AgentRun;
  }) {
    if (input.run.messageId === undefined) return;
    if (
      input.agent.latestTurn !== null &&
      input.agent.latestTurn.requestedAt >= input.run.startedAt
    ) {
      return;
    }

    yield* engine.dispatch(
      agentRoutineTurnStartCommand({
        agent: input.agent,
        routine: input.routine,
        run: { ...input.run, messageId: input.run.messageId },
        commandId: yield* commandId("agent-run-turn-start"),
      }),
    );
  });

  const reconcile = Effect.fn("AgentRoutineReactor.reconcile")(function* () {
    const snapshot = yield* snapshots.getCommandReadModel();
    for (const agent of snapshot.threads) {
      if (agent.kind !== "agent" || agent.deletedAt !== null) continue;
      for (const run of agent.agentRuns ?? []) {
        if (run.status !== "running") continue;
        const routine = agent.agentRoutines?.find((entry) => entry.id === run.routineId);
        if (routine === undefined) continue;
        if (run.messageId === undefined) {
          yield* completeRun({
            agent,
            routine,
            run,
            status: "failed",
            error: "This routine run was created by an older version and cannot be resumed.",
            completedAt: snapshot.updatedAt,
          });
          continue;
        }
        const routineTurnIsLatest =
          agent.latestTurn !== null && agent.latestTurn.requestedAt >= run.startedAt;
        if (routineTurnIsLatest && agent.latestTurn?.state === "completed") {
          const detail = yield* snapshots.getThreadDetailById(agent.id);
          const summary = Option.isSome(detail) ? assistantSummary(detail.value, run) : undefined;
          yield* completeRun({
            agent,
            routine,
            run,
            status: "completed",
            ...(summary !== undefined ? { summary } : {}),
            completedAt: agent.latestTurn.completedAt ?? snapshot.updatedAt,
          });
        } else if (
          routineTurnIsLatest &&
          (agent.latestTurn?.state === "error" || agent.latestTurn?.state === "interrupted")
        ) {
          yield* completeRun({
            agent,
            routine,
            run,
            status: "failed",
            error:
              agent.session?.lastError ??
              (agent.latestTurn.state === "error"
                ? "The scheduled agent run failed."
                : "The scheduled agent run stopped before completing."),
            completedAt: agent.latestTurn.completedAt ?? snapshot.updatedAt,
          });
        } else {
          yield* ensureAgentRunTurn({ agent, routine, run });
        }
      }
    }
  });

  const requestDueRuns = Effect.fn("AgentRoutineReactor.requestDueRuns")(function* () {
    const snapshot = yield* snapshots.getCommandReadModel();
    const now = DateTime.formatIso(yield* DateTime.now);
    for (const agent of snapshot.threads) {
      if (agent.kind !== "agent" || agent.deletedAt !== null) continue;
      for (const routine of agent.agentRoutines ?? []) {
        if (!routine.enabled) continue;
        const scheduledFor = latestDueOccurrence(routine, now);
        if (scheduledFor === null) continue;
        yield* engine.dispatch({
          type: "thread.agent-run.request",
          commandId: yield* commandId("agent-run-request"),
          threadId: agent.id,
          routineId: routine.id,
          runId: AgentRunId.make(yield* uuid.pipe(Effect.orDie)),
          messageId: MessageId.make(yield* uuid.pipe(Effect.orDie)),
          scheduledFor,
          createdAt: now,
        });
      }
    }
  });

  const processEvent = Effect.fn("AgentRoutineReactor.processEvent")(function* (
    event: RelevantEvent,
  ) {
    if (event.type === "thread.agent-run-requested") {
      const snapshot = yield* snapshots.getCommandReadModel();
      const agent = snapshot.threads.find((thread) => thread.id === event.payload.threadId);
      const routine = agent?.agentRoutines?.find((entry) => entry.id === event.payload.routine.id);
      if (agent?.kind === "agent" && routine !== undefined) {
        yield* ensureAgentRunTurn({
          agent,
          routine,
          run: event.payload.run,
        });
      }
      return;
    }

    const snapshot = yield* snapshots.getCommandReadModel();
    const agent = snapshot.threads.find((thread) => thread.id === event.payload.threadId);
    if (agent?.kind !== "agent") return;
    const run = [...(agent.agentRuns ?? [])]
      .filter(
        (entry) =>
          entry.status === "running" &&
          entry.messageId !== undefined &&
          agent.latestTurn !== null &&
          agent.latestTurn.requestedAt >= entry.startedAt,
      )
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
    const routine = agent.agentRoutines?.find((entry) => entry.id === run?.routineId);
    if (agent?.kind !== "agent" || routine === undefined || run === undefined) return;

    if (event.type === "thread.activity-appended") {
      if (
        event.payload.activity.kind !== "approval.requested" &&
        event.payload.activity.kind !== "user-input.requested"
      ) {
        return;
      }
      yield* engine.dispatch({
        type: "thread.agent-run.attention",
        commandId: yield* commandId("agent-run-attention"),
        threadId: agent.id,
        routineId: routine.id,
        runId: run.id,
        summary: event.payload.activity.summary,
        requestedAt: event.payload.activity.createdAt,
      });
      yield* engine.dispatch({
        type: "thread.activity.append",
        commandId: yield* commandId("agent-run-attention-activity"),
        threadId: agent.id,
        activity: {
          id: EventId.make(yield* uuid.pipe(Effect.orDie)),
          tone: "approval",
          kind: "agent.routine.attention-requested",
          summary: `${routine.name} needs attention`,
          payload: {
            runId: run.id,
            routineId: routine.id,
            ...(run.messageId !== undefined ? { messageId: run.messageId } : {}),
            reason: event.payload.activity.summary,
          },
          turnId: null,
          createdAt: event.payload.activity.createdAt,
        },
        createdAt: event.payload.activity.createdAt,
      });
      return;
    }

    if (event.type === "thread.turn-diff-completed") {
      const detail = yield* snapshots.getThreadDetailById(agent.id);
      const summary = Option.isSome(detail) ? assistantSummary(detail.value, run) : undefined;
      yield* completeRun({
        agent,
        routine,
        run,
        status: event.payload.status === "error" ? "failed" : "completed",
        ...(event.payload.status === "error"
          ? { error: "The scheduled agent run could not create a checkpoint." }
          : summary !== undefined
            ? { summary }
            : {}),
        completedAt: event.payload.completedAt,
      });
      return;
    }

    if (event.payload.session.status === "ready" || event.payload.session.status === "idle") {
      const detail = yield* snapshots.getThreadDetailById(agent.id);
      const summary = Option.isSome(detail) ? assistantSummary(detail.value, run) : undefined;
      yield* completeRun({
        agent,
        routine,
        run,
        status: "completed",
        ...(summary !== undefined ? { summary } : {}),
        completedAt: event.payload.session.updatedAt,
      });
      return;
    }

    if (
      event.payload.session.status === "error" ||
      event.payload.session.status === "interrupted" ||
      event.payload.session.status === "stopped"
    ) {
      yield* completeRun({
        agent,
        routine,
        run,
        status: "failed",
        error:
          event.payload.session.lastError ??
          (event.payload.session.status === "error"
            ? "The scheduled agent run failed."
            : "The scheduled agent run stopped before completing."),
        completedAt: event.payload.session.updatedAt,
      });
    }
  });

  const processEventSafely = (event: RelevantEvent) =>
    processEvent(event).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("agent routine reactor failed to process event", {
              eventType: event.type,
              cause: Cause.pretty(cause),
            }),
      ),
    );
  const worker = yield* makeDrainableWorker(processEventSafely);

  const start: AgentRoutineReactorShape["start"] = Effect.fn("AgentRoutineReactor.start")(
    function* () {
      if (config.mode !== "desktop") return;
      // Subscribe before startup recovery schedules anything. Otherwise a due
      // routine can emit its run request before this reactor is listening and
      // remain "running" without ever waking its Agent Chat.
      yield* forkParked(
        Stream.runForEach(engine.streamDomainEvents, (event) => {
          if (
            event.type !== "thread.agent-run-requested" &&
            event.type !== "thread.turn-diff-completed" &&
            event.type !== "thread.session-set" &&
            event.type !== "thread.activity-appended"
          ) {
            return Effect.void;
          }
          return worker.enqueue(event);
        }),
      );
      yield* forkParked(
        Effect.gen(function* () {
          yield* reconcile();
          yield* requestDueRuns();
          yield* worker.drain;
          // The hot event stream is normally attached before this fiber runs.
          // Reconciliation also makes startup recovery correct if activation
          // ordering changes or a run request was committed just before boot.
          yield* reconcile();
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("agent routine startup scheduling failed", {
              cause: Cause.pretty(cause),
            }),
          ),
        ),
      );
      yield* forkParked(
        Effect.sleep("30 seconds").pipe(
          Effect.andThen(requestDueRuns()),
          Effect.catchCause((cause) =>
            Effect.logWarning("agent routine scheduling pass failed", {
              cause: Cause.pretty(cause),
            }),
          ),
          Effect.repeat(Schedule.spaced("30 seconds")),
        ),
      );
    },
  );

  return { start, drain: worker.drain } satisfies AgentRoutineReactorShape;
});

export const AgentRoutineReactorLive = Layer.effect(AgentRoutineReactor, make);
