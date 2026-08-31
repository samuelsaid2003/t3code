import { describe, expect, it } from "vite-plus/test";

import { parseInboundSlackMessage, recordSlackDeliveryWithRetry } from "./slack.ts";

describe("parseInboundSlackMessage", () => {
  it("accepts Samuel's direct text message", () => {
    expect(
      parseInboundSlackMessage(
        {
          type: "message",
          channel: "D123",
          channel_type: "im",
          user: "U-SAMUEL",
          text: "  What's next?  ",
          client_msg_id: "message-1",
          ts: "1.000",
        },
        "U-SAMUEL",
      ),
    ).toEqual({ channel: "D123", sourceId: "message-1", text: "What's next?" });
  });

  it("rejects other users, channels, bots and message subtypes", () => {
    const base = {
      type: "message",
      channel: "D123",
      channel_type: "im",
      user: "U-SAMUEL",
      text: "hello",
      ts: "1.000",
    };
    expect(parseInboundSlackMessage({ ...base, user: "U-OTHER" }, "U-SAMUEL")).toBeNull();
    expect(parseInboundSlackMessage({ ...base, channel_type: "channel" }, "U-SAMUEL")).toBeNull();
    expect(parseInboundSlackMessage({ ...base, bot_id: "B123" }, "U-SAMUEL")).toBeNull();
    expect(
      parseInboundSlackMessage({ ...base, subtype: "message_changed" }, "U-SAMUEL"),
    ).toBeNull();
  });
});

describe("recordSlackDeliveryWithRetry", () => {
  it("retries transient receipt failures with bounded backoff", async () => {
    const waits: number[] = [];
    let attempts = 0;

    await recordSlackDeliveryWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporarily unavailable");
      },
      "assistant-1",
      "slack-message-1",
      async (delayMs) => {
        waits.push(delayMs);
      },
    );

    expect(attempts).toBe(3);
    expect(waits).toEqual([250, 1_000]);
  });

  it("stops after three failed receipt attempts", async () => {
    let attempts = 0;
    await expect(
      recordSlackDeliveryWithRetry(
        async () => {
          attempts += 1;
          throw new Error("offline");
        },
        "assistant-1",
        "slack-message-1",
        async () => undefined,
      ),
    ).rejects.toThrow("offline");
    expect(attempts).toBe(3);
  });
});
