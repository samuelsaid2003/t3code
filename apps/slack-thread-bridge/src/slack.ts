// @effect-diagnostics globalTimers:off -- Slack callbacks need a small bounded retry delay.
import { LogLevel as SocketLogLevel, SocketModeClient } from "@slack/socket-mode";
import { LogLevel as WebLogLevel, WebClient } from "@slack/web-api";
import * as Schema from "effect/Schema";

import { safeErrorMessage } from "./errors.ts";
import { splitSlackText } from "./text.ts";

const SlackMessageEvent = Schema.Struct({
  type: Schema.Literal("message"),
  channel: Schema.String,
  channel_type: Schema.optionalKey(Schema.String),
  user: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  subtype: Schema.optionalKey(Schema.String),
  bot_id: Schema.optionalKey(Schema.String),
  client_msg_id: Schema.optionalKey(Schema.String),
  event_ts: Schema.optionalKey(Schema.String),
  ts: Schema.optionalKey(Schema.String),
  thread_ts: Schema.optionalKey(Schema.String),
});
const isSlackMessageEvent = Schema.is(SlackMessageEvent);

export interface InboundSlackMessage {
  readonly channel: string;
  readonly sourceId: string;
  readonly text: string;
  readonly threadTs?: string;
}

export function parseInboundSlackMessage(
  event: unknown,
  allowedUserId: string,
): InboundSlackMessage | null {
  if (!isSlackMessageEvent(event)) return null;
  if (
    event.channel_type !== "im" ||
    event.user !== allowedUserId ||
    event.subtype !== undefined ||
    event.bot_id !== undefined
  ) {
    return null;
  }
  const text = event.text?.trim();
  const sourceId = event.client_msg_id ?? event.event_ts ?? event.ts;
  if (!text || !sourceId) return null;
  return {
    channel: event.channel,
    sourceId,
    text,
    ...(event.thread_ts === undefined ? {} : { threadTs: event.thread_ts }),
  };
}

export interface SlackGatewayOptions {
  readonly appToken: string;
  readonly botToken: string;
  readonly allowedUserId: string;
  readonly ask: (
    text: string,
    sourceId: string,
  ) => Promise<{ readonly text: string; readonly messageId: string }>;
  readonly markDelivered: (messageId: string, sourceId: string) => Promise<void>;
}

const DELIVERY_RECEIPT_RETRY_DELAYS_MS = [250, 1_000] as const;

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function recordSlackDeliveryWithRetry(
  markDelivered: SlackGatewayOptions["markDelivered"],
  messageId: string,
  sourceId: string,
  wait: (delayMs: number) => Promise<void> = waitForRetry,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DELIVERY_RECEIPT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await markDelivered(messageId, sourceId);
      return;
    } catch (error) {
      lastError = error;
      const delayMs = DELIVERY_RECEIPT_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) break;
      await wait(delayMs);
    }
  }
  throw lastError;
}

interface SocketMessageEnvelope {
  readonly ack: () => Promise<void>;
  readonly event: unknown;
}

function isSocketMessageEnvelope(value: unknown): value is SocketMessageEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ack === "function" && "event" in candidate;
}

export class SlackGateway {
  private readonly options: SlackGatewayOptions;
  private readonly socket: SocketModeClient;
  private readonly web: WebClient;
  private readonly inFlight = new Set<string>();
  private readonly completed = new Set<string>();
  private directMessageChannelId: string | null = null;

  constructor(options: SlackGatewayOptions) {
    this.options = options;
    this.socket = new SocketModeClient({
      appToken: options.appToken,
      logLevel: SocketLogLevel.WARN,
    });
    this.web = new WebClient(options.botToken, { logLevel: WebLogLevel.WARN });
    this.socket.on("message", (payload: unknown) => {
      void this.handleSocketMessage(payload);
    });
    this.socket.on("error", (error: unknown) => {
      process.stderr.write(`Slack socket error: ${safeErrorMessage(error)}\n`);
    });
  }

  private async handleSocketMessage(payload: unknown): Promise<void> {
    if (!isSocketMessageEnvelope(payload)) return;
    try {
      await payload.ack();
    } catch (error) {
      process.stderr.write(`Slack acknowledgement failed: ${safeErrorMessage(error)}\n`);
      return;
    }

    const message = parseInboundSlackMessage(payload.event, this.options.allowedUserId);
    if (
      message === null ||
      this.inFlight.has(message.sourceId) ||
      this.completed.has(message.sourceId)
    ) {
      return;
    }
    this.inFlight.add(message.sourceId);
    try {
      const answer = await this.options.ask(message.text, message.sourceId);
      await this.post(message.channel, answer.text, message.threadTs);
      this.completed.add(message.sourceId);
      if (this.completed.size > 500) this.completed.delete(this.completed.values().next().value!);
      try {
        await recordSlackDeliveryWithRetry(
          this.options.markDelivered,
          answer.messageId,
          message.sourceId,
        );
      } catch (error) {
        process.stderr.write(`T3 Slack delivery receipt failed: ${safeErrorMessage(error)}\n`);
      }
    } catch (error) {
      process.stderr.write(`Slack-to-T3 turn failed: ${safeErrorMessage(error)}\n`);
      try {
        await this.post(
          message.channel,
          "I couldn't complete that through T3. Check that T3 Code is open and the bridge is still paired, then resend it.",
          message.threadTs,
        );
      } catch (postError) {
        process.stderr.write(`Slack error reply failed: ${safeErrorMessage(postError)}\n`);
      }
    } finally {
      this.inFlight.delete(message.sourceId);
    }
  }

  async start(): Promise<void> {
    await this.socket.start();
  }

  async stop(): Promise<void> {
    await this.socket.disconnect();
  }

  async sendDirectMessage(text: string): Promise<void> {
    if (this.directMessageChannelId === null) {
      const opened = await this.web.conversations.open({
        users: this.options.allowedUserId,
      });
      const channelId = opened.channel?.id;
      if (!channelId) throw new Error("Slack did not return a direct-message channel.");
      this.directMessageChannelId = channelId;
    }
    await this.post(this.directMessageChannelId, text);
  }

  private async post(channel: string, text: string, threadTs?: string): Promise<void> {
    for (const chunk of splitSlackText(text)) {
      await this.web.chat.postMessage({
        channel,
        text: chunk,
        ...(threadTs === undefined ? {} : { thread_ts: threadTs }),
      });
    }
  }
}
