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
  readonly messageTs: string;
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
  if (!text || !sourceId || !event.ts) return null;
  return {
    channel: event.channel,
    messageTs: event.ts,
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
    onAssistantText?: (text: string) => Promise<void> | void,
  ) => Promise<{ readonly text: string; readonly messageId: string }>;
  readonly markDelivered: (messageId: string, sourceId: string) => Promise<void>;
}

const DELIVERY_RECEIPT_RETRY_DELAYS_MS = [250, 1_000] as const;
const SLACK_STREAM_BUFFER_CHARS = 256;
const SLACK_STREAM_CHUNK_CHARS = 12_000;

type SlackChatApi = Pick<
  WebClient["chat"],
  "appendStream" | "startStream" | "stopStream" | "update"
>;

export class SlackResponseStream {
  private bufferedText = "";
  private readonly channel: string;
  private readonly chat: SlackChatApi;
  private observedText = "";
  private streamTs: string | null = null;
  private stopped = false;
  private readonly threadTs: string;

  constructor(chat: SlackChatApi, channel: string, threadTs: string) {
    this.chat = chat;
    this.channel = channel;
    this.threadTs = threadTs;
  }

  get started(): boolean {
    return this.streamTs !== null;
  }

  async update(text: string): Promise<void> {
    if (this.stopped || text === this.observedText) return;
    if (!text.startsWith(this.observedText)) {
      throw new Error("T3 assistant streaming text changed non-monotonically.");
    }
    let delta = text.slice(this.observedText.length);
    this.observedText = text;
    if (delta.length === 0) return;

    if (this.streamTs === null) {
      const initialText = delta.slice(0, SLACK_STREAM_CHUNK_CHARS);
      const response = await this.chat.startStream({
        channel: this.channel,
        thread_ts: this.threadTs,
        markdown_text: initialText,
      });
      if (!response.ts) throw new Error("Slack did not return a streaming message timestamp.");
      this.streamTs = response.ts;
      delta = delta.slice(initialText.length);
    }

    this.bufferedText += delta;
    await this.flushBufferedText();
  }

  async finish(finalText: string): Promise<void> {
    await this.update(finalText);
    if (this.streamTs === null) throw new Error("Slack response stream never started.");
    while (this.bufferedText.length > SLACK_STREAM_CHUNK_CHARS) {
      await this.appendChunk(this.bufferedText.slice(0, SLACK_STREAM_CHUNK_CHARS));
      this.bufferedText = this.bufferedText.slice(SLACK_STREAM_CHUNK_CHARS);
    }
    const markdownText = this.bufferedText;
    this.bufferedText = "";
    await this.chat.stopStream({
      channel: this.channel,
      ts: this.streamTs,
      ...(markdownText === "" ? {} : { markdown_text: markdownText }),
    });
    this.stopped = true;
  }

  async repair(finalText: string): Promise<boolean> {
    if (this.streamTs === null) return false;
    if (!this.stopped) {
      try {
        await this.chat.stopStream({ channel: this.channel, ts: this.streamTs });
      } catch {
        // chat.update below still restores the user-visible final response.
      }
    }
    await this.chat.update({ channel: this.channel, ts: this.streamTs, text: finalText });
    this.stopped = true;
    return true;
  }

  private async flushBufferedText(): Promise<void> {
    while (this.bufferedText.length >= SLACK_STREAM_BUFFER_CHARS) {
      const chunk = this.bufferedText.slice(0, SLACK_STREAM_CHUNK_CHARS);
      await this.appendChunk(chunk);
      this.bufferedText = this.bufferedText.slice(chunk.length);
    }
  }

  private async appendChunk(markdownText: string): Promise<void> {
    if (this.streamTs === null) throw new Error("Slack response stream has not started.");
    await this.chat.appendStream({
      channel: this.channel,
      ts: this.streamTs,
      markdown_text: markdownText,
    });
  }
}

function slackErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return undefined;
  const data = error.data;
  if (typeof data !== "object" || data === null || !("error" in data)) return undefined;
  return typeof data.error === "string" ? data.error : undefined;
}

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
    let currentReaction: string | null = null;
    const setReaction = async (nextReaction: string | null) => {
      if (
        await this.replaceReaction(
          message.channel,
          message.messageTs,
          currentReaction,
          nextReaction,
        )
      ) {
        currentReaction = nextReaction;
      }
    };
    try {
      await setReaction("hourglass_flowing_sand");
      const stream = new SlackResponseStream(
        this.web.chat,
        message.channel,
        message.threadTs ?? message.messageTs,
      );
      let assistantTextForSlack = "";
      let streamError: unknown;
      let sawAssistantText = false;
      const answer = await this.options.ask(
        message.text,
        message.sourceId,
        async (assistantText) => {
          assistantTextForSlack = assistantText;
          if (!sawAssistantText) {
            sawAssistantText = true;
            await setReaction("eyes");
          }
          if (streamError !== undefined) return;
          try {
            await stream.update(assistantText);
          } catch (error) {
            streamError = error;
            process.stderr.write(`Slack response stream failed: ${safeErrorMessage(error)}\n`);
          }
        },
      );

      if (!sawAssistantText) {
        sawAssistantText = true;
        await setReaction("eyes");
      }
      let delivered = false;
      const finalSlackText = assistantTextForSlack || answer.text;
      if (streamError === undefined) {
        try {
          await stream.finish(finalSlackText);
          delivered = true;
        } catch (error) {
          streamError = error;
          process.stderr.write(`Slack response stream failed: ${safeErrorMessage(error)}\n`);
        }
      }
      if (!delivered && stream.started) {
        try {
          delivered = await stream.repair(finalSlackText);
        } catch (error) {
          process.stderr.write(`Slack response stream repair failed: ${safeErrorMessage(error)}\n`);
        }
      }
      if (!delivered) await this.post(message.channel, answer.text, message.threadTs);

      await setReaction(null);
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
      await setReaction("x");
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

  private async replaceReaction(
    channel: string,
    timestamp: string,
    previous: string | null,
    next: string | null,
  ): Promise<boolean> {
    if (previous !== null && previous !== next) {
      try {
        await this.web.reactions.remove({ channel, timestamp, name: previous });
      } catch (error) {
        if (slackErrorCode(error) !== "no_reaction") {
          process.stderr.write(`Slack reaction removal failed: ${safeErrorMessage(error)}\n`);
        }
      }
    }
    if (next === null) return true;
    try {
      await this.web.reactions.add({ channel, timestamp, name: next });
      return true;
    } catch (error) {
      if (slackErrorCode(error) === "already_reacted") return true;
      process.stderr.write(`Slack reaction update failed: ${safeErrorMessage(error)}\n`);
      return false;
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
