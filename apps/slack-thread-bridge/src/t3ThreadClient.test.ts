import {
  MessageId,
  ThreadId,
  TurnId,
  type ClientOrchestrationCommand,
  type OrchestrationMessage,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { T3ThreadClient } from "./t3ThreadClient.ts";
import type { ThreadTracker, TurnCompletion } from "./threadTracker.ts";

const TURN_ID = TurnId.make("turn-1");
const COMPLETION: TurnCompletion = {
  turnId: TURN_ID,
  status: "ready",
  assistantMessageId: MessageId.make("assistant-1"),
  completedAt: "2026-08-31T10:01:00.000Z",
};

function assistantMessage(text: string, id = MessageId.make("assistant-1")): OrchestrationMessage {
  return {
    id,
    role: "assistant",
    text,
    turnId: TURN_ID,
    streaming: false,
    createdAt: "2026-08-31T10:01:00.000Z",
    updatedAt: "2026-08-31T10:01:00.000Z",
  };
}

function tracker(existingAnswer?: OrchestrationMessage): ThreadTracker {
  return {
    existingAnswerMessage: () => existingAnswer,
    waitUntilAvailable: async () => undefined,
    currentTurnSettings: () => ({ runtimeMode: "full-access", interactionMode: "default" }),
    waitForTurnId: async () => TURN_ID,
    waitForCompletion: async () => COMPLETION,
    finalAssistantMessage: async () => assistantMessage("Done from the same T3 thread."),
  } as unknown as ThreadTracker;
}

describe("T3ThreadClient", () => {
  it("dispatches a stable same-thread turn command and returns its final answer", async () => {
    const commands: ClientOrchestrationCommand[] = [];
    const client = new T3ThreadClient(
      tracker(),
      ThreadId.make("the-general-thread"),
      1_000,
      async (command) => {
        commands.push(command);
        return { sequence: 10 };
      },
    );

    await expect(client.ask("What is next?", "slack-message-1")).resolves.toEqual({
      text: "Done from the same T3 thread.",
      messageId: "assistant-1",
    });
    expect(commands).toEqual([
      {
        type: "thread.turn.start",
        commandId: "slack:slack-message-1",
        threadId: "the-general-thread",
        message: {
          messageId: "slack:slack-message-1",
          role: "user",
          text: "What is next?",
          attachments: [],
          externalSource: "slack",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: expect.any(String),
      },
    ]);
  });

  it("uses the durable answer when Slack redelivers an already-completed message", async () => {
    let dispatches = 0;
    const client = new T3ThreadClient(
      tracker(assistantMessage("Already answered.", MessageId.make("assistant-existing"))),
      ThreadId.make("the-general-thread"),
      1_000,
      async () => {
        dispatches += 1;
      },
    );
    await expect(client.ask("Duplicate", "same-id")).resolves.toEqual({
      text: "Already answered.",
      messageId: "assistant-existing",
    });
    expect(dispatches).toBe(0);
  });

  it("records a stable Slack delivery receipt command", async () => {
    const commands: ClientOrchestrationCommand[] = [];
    const client = new T3ThreadClient(
      tracker(),
      ThreadId.make("the-general-thread"),
      1_000,
      async (command) => {
        commands.push(command);
      },
    );

    await client.recordSlackDelivery(MessageId.make("assistant-1"), "slack-message-1");

    expect(commands).toEqual([
      {
        type: "thread.message.delivery.record",
        commandId: "slack-delivery:slack-message-1",
        threadId: "the-general-thread",
        messageId: "assistant-1",
        receipt: { channel: "slack", deliveredAt: expect.any(String) },
      },
    ]);
  });
});
