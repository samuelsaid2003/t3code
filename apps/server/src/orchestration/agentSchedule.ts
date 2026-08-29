import type {
  AgentRoutine,
  AgentRoutineSchedule,
  AgentRun,
  CommandId,
  MessageId,
  OrchestrationCommand,
  OrchestrationThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

function atWallClock(value: DateTime.Zoned, hour: number, minute: number): DateTime.Zoned {
  return DateTime.setParts(value, {
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
}

function atMonthDay(value: DateTime.Zoned, monthDay: number): DateTime.Zoned {
  const lastDay = DateTime.toParts(DateTime.endOf(value, "month")).day;
  return DateTime.setParts(value, { day: Math.min(monthDay, lastDay) });
}

export function nextAgentRoutineOccurrence(
  schedule: AgentRoutineSchedule,
  afterIso: string,
): string | null {
  if (schedule.kind === "once") {
    const once = DateTime.make(schedule.at);
    const after = DateTime.make(afterIso);
    return Option.isSome(once) &&
      Option.isSome(after) &&
      DateTime.isGreaterThan(once.value, after.value)
      ? DateTime.formatIso(once.value)
      : null;
  }

  const after = DateTime.make(afterIso);
  const zone = DateTime.zoneMakeNamed(schedule.timeZone);
  if (Option.isNone(after) || Option.isNone(zone)) {
    return null;
  }

  const zonedAfter = DateTime.setZone(after.value, zone.value);
  let candidate = atWallClock(zonedAfter, schedule.hour, schedule.minute);

  if (schedule.kind === "daily") {
    if (!DateTime.isGreaterThan(candidate, zonedAfter)) {
      candidate = DateTime.add(candidate, { days: 1 });
    }
    return DateTime.formatIso(candidate);
  }

  if (schedule.kind === "weekly") {
    const currentWeekDay = DateTime.toParts(candidate).weekDay;
    let daysUntil = (schedule.weekDay - currentWeekDay + 7) % 7;
    if (daysUntil === 0 && !DateTime.isGreaterThan(candidate, zonedAfter)) {
      daysUntil = 7;
    }
    return DateTime.formatIso(DateTime.add(candidate, { days: daysUntil }));
  }

  candidate = atMonthDay(candidate, schedule.monthDay);
  if (!DateTime.isGreaterThan(candidate, zonedAfter)) {
    candidate = atMonthDay(DateTime.add(candidate, { months: 1 }), schedule.monthDay);
  }
  return DateTime.formatIso(candidate);
}

export function agentRoutineTurnStartCommand(input: {
  agent: Pick<OrchestrationThread, "id" | "modelSelection" | "runtimeMode" | "interactionMode">;
  routine: Pick<AgentRoutine, "prompt">;
  run: Pick<AgentRun, "id" | "startedAt"> & { messageId: MessageId };
  commandId: CommandId;
}): Extract<OrchestrationCommand, { type: "thread.turn.start" }> {
  return {
    type: "thread.turn.start",
    commandId: input.commandId,
    threadId: input.agent.id,
    message: {
      messageId: input.run.messageId,
      role: "user",
      text: input.routine.prompt,
      routineRunId: input.run.id,
      attachments: [],
    },
    modelSelection: input.agent.modelSelection,
    runtimeMode: input.agent.runtimeMode,
    interactionMode: input.agent.interactionMode,
    createdAt: input.run.startedAt,
  };
}
