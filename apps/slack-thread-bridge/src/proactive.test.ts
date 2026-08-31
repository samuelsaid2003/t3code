import { MessageId, type OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveProactiveSlackDelivery } from "./proactive.ts";
import type { ThreadTracker } from "./threadTracker.ts";

const tracker = {
  routineResponseDetails: () => ({
    text: "Routine result",
    messageId: MessageId.make("assistant-routine"),
  }),
} as Pick<ThreadTracker, "routineResponseDetails">;

function event(type: OrchestrationEvent["type"], payload: unknown): OrchestrationEvent {
  return { type, payload } as OrchestrationEvent;
}

describe("resolveProactiveSlackDelivery", () => {
  it("forwards routine completions and attention requests", () => {
    expect(
      resolveProactiveSlackDelivery(
        event("thread.agent-run-completed", { runId: "run-1" }),
        tracker,
      ),
    ).toEqual({
      id: "completed:run-1",
      text: "Routine result",
      messageId: "assistant-routine",
    });
    expect(
      resolveProactiveSlackDelivery(
        event("thread.agent-run-attention-requested", {
          runId: "run-1",
          summary: "Approval required",
        }),
        tracker,
      ),
    ).toEqual({
      id: "attention:run-1",
      text: "Scheduled routine needs attention: Approval required",
    });
  });

  it("does not mirror ordinary T3 messages or turns", () => {
    expect(
      resolveProactiveSlackDelivery(
        event("thread.message-sent", {
          messageId: "ordinary-assistant",
          role: "assistant",
          text: "Started in T3",
        }),
        tracker,
      ),
    ).toBeNull();
    expect(resolveProactiveSlackDelivery(null, tracker)).toBeNull();
  });
});
