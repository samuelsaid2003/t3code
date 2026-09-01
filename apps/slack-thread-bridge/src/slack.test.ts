import { describe, expect, it } from "vite-plus/test";

import {
  parseInboundSlackMessage,
  recordSlackDeliveryWithRetry,
  SlackResponseStream,
} from "./slack.ts";

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
    ).toEqual({
      channel: "D123",
      messageTs: "1.000",
      sourceId: "message-1",
      text: "What's next?",
    });
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

describe("SlackResponseStream", () => {
  it("starts immediately, batches later text and finalizes one Slack message", async () => {
    const calls: Array<{ readonly method: string; readonly input: unknown }> = [];
    const chat = {
      startStream: async (input: unknown) => {
        calls.push({ method: "start", input });
        return { ok: true, ts: "2.000" };
      },
      appendStream: async (input: unknown) => {
        calls.push({ method: "append", input });
        return { ok: true };
      },
      stopStream: async (input: unknown) => {
        calls.push({ method: "stop", input });
        return { ok: true };
      },
      update: async (input: unknown) => {
        calls.push({ method: "update", input });
        return { ok: true };
      },
    } as unknown as ConstructorParameters<typeof SlackResponseStream>[0];
    const stream = new SlackResponseStream(chat, "D123", "1.000");

    await stream.update("Hello");
    await stream.update(`Hello${"a".repeat(255)}`);
    await stream.update(`Hello${"a".repeat(256)}`);
    await stream.finish(`Hello${"a".repeat(256)}`);

    expect(calls).toEqual([
      {
        method: "start",
        input: { channel: "D123", thread_ts: "1.000", markdown_text: "Hello" },
      },
      {
        method: "append",
        input: { channel: "D123", ts: "2.000", markdown_text: "a".repeat(256) },
      },
      { method: "stop", input: { channel: "D123", ts: "2.000" } },
    ]);
  });

  it("rejects non-monotonic provider text instead of duplicating it", async () => {
    const chat = {
      startStream: async () => ({ ok: true, ts: "2.000" }),
      appendStream: async () => ({ ok: true }),
      stopStream: async () => ({ ok: true }),
      update: async () => ({ ok: true }),
    } as unknown as ConstructorParameters<typeof SlackResponseStream>[0];
    const stream = new SlackResponseStream(chat, "D123", "1.000");

    await stream.update("First version");
    await expect(stream.update("Changed version")).rejects.toThrow("non-monotonically");
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
