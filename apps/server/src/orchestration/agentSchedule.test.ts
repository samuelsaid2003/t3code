import { describe, expect, it } from "vite-plus/test";

import { AgentRunId, CommandId, MessageId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import { agentRoutineTurnStartCommand, nextAgentRoutineOccurrence } from "./agentSchedule.ts";

describe("agentRoutineTurnStartCommand", () => {
  it("wakes the parent chat with its current execution settings and a hidden trigger marker", () => {
    const command = agentRoutineTurnStartCommand({
      agent: {
        id: ThreadId.make("agent-1"),
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.6-terra",
          options: [{ id: "reasoningEffort", value: "medium" }],
        },
        runtimeMode: "full-access",
        interactionMode: "default",
      },
      routine: { prompt: "Check the repository." },
      run: {
        id: AgentRunId.make("run-1"),
        messageId: MessageId.make("message-1"),
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      commandId: CommandId.make("command-1"),
    });

    expect(command).toMatchObject({
      type: "thread.turn.start",
      threadId: "agent-1",
      message: {
        messageId: "message-1",
        routineRunId: "run-1",
        text: "Check the repository.",
      },
      modelSelection: {
        instanceId: "codex",
        model: "gpt-5.6-terra",
        options: [{ id: "reasoningEffort", value: "medium" }],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
    });
  });
});

describe("nextAgentRoutineOccurrence", () => {
  it("returns an upcoming one-time occurrence and then exhausts it", () => {
    const schedule = {
      kind: "once" as const,
      at: "2026-01-02T00:00:00.000Z",
      timeZone: "UTC",
    };
    expect(nextAgentRoutineOccurrence(schedule, "2026-01-01T00:00:00.000Z")).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(nextAgentRoutineOccurrence(schedule, schedule.at)).toBeNull();
  });

  it("schedules daily and weekly wall-clock time in the selected zone", () => {
    expect(
      nextAgentRoutineOccurrence(
        { kind: "daily", hour: 9, minute: 0, timeZone: "Australia/Melbourne" },
        "2026-01-01T00:00:00.000Z",
      ),
    ).toBe("2026-01-01T22:00:00.000Z");
    expect(
      nextAgentRoutineOccurrence(
        {
          kind: "weekly",
          weekDay: 1,
          hour: 9,
          minute: 0,
          timeZone: "Australia/Melbourne",
        },
        "2026-01-01T00:00:00.000Z",
      ),
    ).toBe("2026-01-04T22:00:00.000Z");
  });

  it("clamps monthly schedules to the last day of a shorter month", () => {
    expect(
      nextAgentRoutineOccurrence(
        {
          kind: "monthly",
          monthDay: 31,
          hour: 9,
          minute: 0,
          timeZone: "Australia/Melbourne",
        },
        "2026-01-30T23:30:00.000Z",
      ),
    ).toBe("2026-02-27T22:00:00.000Z");
  });

  it("rejects an invalid IANA time zone", () => {
    expect(
      nextAgentRoutineOccurrence(
        { kind: "daily", hour: 9, minute: 0, timeZone: "Mars/Olympus_Mons" },
        "2026-01-01T00:00:00.000Z",
      ),
    ).toBeNull();
  });
});
