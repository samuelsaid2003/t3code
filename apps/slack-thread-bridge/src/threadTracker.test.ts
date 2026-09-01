import {
  CheckpointRef,
  EventId,
  MessageId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
  type OrchestrationThread,
  type OrchestrationThreadStreamItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { ThreadTracker } from "./threadTracker.ts";

const THREAD_ID = ThreadId.make("thread-1");
const BASE_TIME = "2026-08-31T10:00:00.000Z";

function baseThread(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    id: THREAD_ID,
    projectId: "project-1",
    kind: "agent",
    parentThreadId: null,
    agentProfile: null,
    agentRoutines: [],
    agentRuns: [],
    title: "The General",
    modelSelection: { instanceId: "codex", model: "gpt-5.6-sol", options: {} },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    linkedPullRequest: null,
    latestTurn: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
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
    ...overrides,
  } as OrchestrationThread;
}

function snapshot(thread = baseThread()): OrchestrationThreadStreamItem {
  return { kind: "snapshot", snapshot: { snapshotSequence: 1, thread } };
}

function event<T extends OrchestrationEvent["type"]>(
  sequence: number,
  type: T,
  payload: Extract<OrchestrationEvent, { type: T }>["payload"],
): OrchestrationThreadStreamItem {
  return {
    kind: "event",
    event: {
      eventId: EventId.make(`event-${String(sequence)}`),
      sequence,
      occurredAt: BASE_TIME,
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      aggregateKind: "thread",
      aggregateId: THREAD_ID,
      type,
      payload,
    } as Extract<OrchestrationEvent, { type: T }>,
  };
}

function session(activeTurnId: TurnId | null, status: "running" | "ready") {
  return {
    threadId: THREAD_ID,
    status,
    providerName: "codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    runtimeMode: "full-access" as const,
    activeTurnId,
    lastError: null,
    updatedAt: BASE_TIME,
  };
}

describe("ThreadTracker", () => {
  it("correlates a Slack message to its provider turn and final streamed response", async () => {
    const tracker = new ThreadTracker();
    tracker.apply(snapshot());
    tracker.apply({ kind: "synchronized" });
    await tracker.waitUntilReady(100);

    const messageId = MessageId.make("slack:message-1");
    const turnId = TurnId.make("turn-1");
    const turnPromise = tracker.waitForTurnId(messageId, 100);
    tracker.apply(
      event(2, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId,
        role: "user",
        text: "Hello from Slack",
        turnId: null,
        streaming: false,
        externalSource: "slack",
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(3, "thread.session-set", { threadId: THREAD_ID, session: session(turnId, "running") }),
    );
    expect(await turnPromise).toBe(turnId);

    const assistantMessageId = MessageId.make("assistant-1");
    tracker.apply(
      event(4, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId: assistantMessageId,
        role: "assistant",
        text: "Hello ",
        turnId,
        streaming: true,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(5, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId: assistantMessageId,
        role: "assistant",
        text: "Samuel",
        turnId,
        streaming: true,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(6, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId: assistantMessageId,
        role: "assistant",
        text: "",
        turnId,
        streaming: false,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(7, "thread.turn-diff-completed", {
        threadId: THREAD_ID,
        turnId,
        checkpointTurnCount: 1,
        checkpointRef: CheckpointRef.make("checkpoint-1"),
        status: "ready",
        files: [],
        assistantMessageId,
        completedAt: BASE_TIME,
      }),
    );

    const completion = await tracker.waitForCompletion(turnId, 100);
    expect(await tracker.finalAssistantText(completion, 100)).toBe("Hello Samuel");
  });

  it("does not assign a queued Slack message to an already-running external turn", async () => {
    const externalTurnId = TurnId.make("external-turn");
    const tracker = new ThreadTracker();
    tracker.apply(snapshot(baseThread({ session: session(externalTurnId, "running") })));
    tracker.apply({ kind: "synchronized" });

    const messageId = MessageId.make("slack:queued");
    tracker.apply(
      event(2, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId,
        role: "user",
        text: "Queued from Slack",
        turnId: null,
        streaming: false,
        externalSource: "slack",
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(3, "thread.session-set", {
        threadId: THREAD_ID,
        session: session(externalTurnId, "running"),
      }),
    );

    let resolved = false;
    const turnPromise = tracker.waitForTurnId(messageId, 100).then((turnId) => {
      resolved = true;
      return turnId;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    tracker.apply(
      event(4, "thread.session-set", { threadId: THREAD_ID, session: session(null, "ready") }),
    );
    const slackTurnId = TurnId.make("slack-turn");
    tracker.apply(
      event(5, "thread.session-set", {
        threadId: THREAD_ID,
        session: session(slackTurnId, "running"),
      }),
    );
    expect(await turnPromise).toBe(slackTurnId);
  });

  it("uses the full routine response instead of its truncated ledger summary", () => {
    const tracker = new ThreadTracker();
    tracker.apply(snapshot());
    const runId = "run-1";
    tracker.apply(
      event(2, "thread.agent-run-requested", {
        threadId: THREAD_ID,
        routine: {
          id: "routine-1",
          name: "Morning brief",
          prompt: "Send the brief",
          schedule: { kind: "daily", hour: 8, minute: 0, timeZone: "Australia/Melbourne" },
          enabled: true,
          nextRunAt: BASE_TIME,
          lastRunAt: null,
          lastStatus: null,
          createdAt: BASE_TIME,
          updatedAt: BASE_TIME,
        },
        run: {
          id: runId,
          routineId: "routine-1",
          messageId: MessageId.make("routine-message"),
          status: "running",
          scheduledFor: BASE_TIME,
          startedAt: BASE_TIME,
          completedAt: null,
          summary: null,
          error: null,
        },
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(3, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId: MessageId.make("routine-answer"),
        role: "assistant",
        text: "The full morning brief.",
        turnId: TurnId.make("routine-turn"),
        streaming: false,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(4, "thread.turn-start-requested", {
        threadId: THREAD_ID,
        messageId: MessageId.make("routine-message"),
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: BASE_TIME,
      }),
    );
    tracker.apply(
      event(5, "thread.session-set", {
        threadId: THREAD_ID,
        session: session(TurnId.make("routine-turn"), "running"),
      }),
    );
    tracker.apply(
      event(6, "thread.message-sent", {
        threadId: THREAD_ID,
        messageId: MessageId.make("other-answer"),
        role: "assistant",
        text: "A later response from another turn.",
        turnId: TurnId.make("other-turn"),
        streaming: false,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      }),
    );
    const completed = event(7, "thread.agent-run-completed", {
      threadId: THREAD_ID,
      routineId: "routine-1",
      runId,
      status: "completed",
      summary: "Truncated brief",
      completedAt: BASE_TIME,
      updatedAt: BASE_TIME,
    });
    tracker.apply(completed);
    if (completed.kind !== "event" || completed.event.type !== "thread.agent-run-completed") {
      throw new Error("Expected a completed run event.");
    }
    expect(tracker.routineResponse(completed.event)).toBe("The full morning brief.");
  });
});
