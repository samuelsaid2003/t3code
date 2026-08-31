// @effect-diagnostics globalDate:off -- Slack callback timestamps become durable T3 command timestamps.
import {
  type ClientOrchestrationCommand,
  CommandId,
  EnvironmentId,
  MessageId,
  ORCHESTRATION_WS_METHODS,
  ThreadId,
} from "@t3tools/contracts";
import {
  BearerConnectionTarget,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import { RpcSessionFactory } from "@t3tools/client-runtime/rpc";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { T3AuthState } from "./t3Auth.ts";
import { issueWebSocketUrl } from "./t3Auth.ts";
import { ThreadTracker } from "./threadTracker.ts";

export class T3ThreadClient {
  readonly tracker: ThreadTracker;
  private readonly threadId: ThreadId;
  private readonly turnTimeoutMs: number;
  private readonly dispatch: (command: ClientOrchestrationCommand) => Promise<unknown>;

  constructor(
    tracker: ThreadTracker,
    threadId: ThreadId,
    turnTimeoutMs: number,
    dispatch: (command: ClientOrchestrationCommand) => Promise<unknown>,
  ) {
    this.tracker = tracker;
    this.threadId = threadId;
    this.turnTimeoutMs = turnTimeoutMs;
    this.dispatch = dispatch;
  }

  async ask(
    text: string,
    sourceId: string,
  ): Promise<{ readonly text: string; readonly messageId: MessageId }> {
    const messageId = MessageId.make(`slack:${sourceId}`);
    const existing = this.tracker.existingAnswerMessage(messageId);
    if (existing !== undefined) return { text: existing.text, messageId: existing.id };

    await this.tracker.waitUntilAvailable(this.turnTimeoutMs);
    const settings = this.tracker.currentTurnSettings();
    await this.dispatch({
      type: "thread.turn.start",
      commandId: CommandId.make(`slack:${sourceId}`),
      threadId: this.threadId,
      message: {
        messageId,
        role: "user",
        text,
        attachments: [],
        externalSource: "slack",
      },
      runtimeMode: settings.runtimeMode,
      interactionMode: settings.interactionMode,
      createdAt: new Date().toISOString(),
    });

    const turnId = await this.tracker.waitForTurnId(messageId, this.turnTimeoutMs);
    const completion = await this.tracker.waitForCompletion(turnId, this.turnTimeoutMs);
    if (completion.status === "error") {
      throw new Error("The T3 turn ended with an error.");
    }
    const answer = await this.tracker.finalAssistantMessage(completion, 30_000);
    return { text: answer.text, messageId: answer.id };
  }

  async recordSlackDelivery(messageId: MessageId, sourceId: string): Promise<void> {
    const deliveredAt = new Date().toISOString();
    await this.dispatch({
      type: "thread.message.delivery.record",
      commandId: CommandId.make(`slack-delivery:${sourceId}`),
      threadId: this.threadId,
      messageId,
      receipt: { channel: "slack", deliveredAt },
    });
  }
}

export const connectT3Thread = Effect.fn("slackThreadBridge.connectT3Thread")(function* (input: {
  readonly auth: T3AuthState;
  readonly threadId: string;
  readonly turnTimeoutMs: number;
}) {
  const socketUrl = yield* Effect.promise(() => issueWebSocketUrl(input.auth));
  const environmentId = EnvironmentId.make(input.auth.environmentId);
  const target = new BearerConnectionTarget({
    environmentId,
    label: input.auth.label,
    connectionId: `slack-thread-bridge:${environmentId}`,
  });
  const prepared: PreparedConnection = {
    environmentId,
    label: input.auth.label,
    httpBaseUrl: input.auth.httpBaseUrl,
    socketUrl,
    httpAuthorization: { _tag: "Bearer", token: input.auth.accessToken },
    target,
  };

  const sessions = yield* RpcSessionFactory;
  const session = yield* sessions.connect(prepared);
  yield* session.ready;

  const tracker = new ThreadTracker();
  const threadId = ThreadId.make(input.threadId);
  const streamFiber = yield* session.client[ORCHESTRATION_WS_METHODS.subscribeThread]({
    threadId,
    requestCompletionMarker: true,
  }).pipe(
    Stream.runForEach((item) => Effect.sync(() => tracker.apply(item))),
    Effect.forkScoped,
  );
  yield* Effect.promise(() => tracker.waitUntilReady(30_000));

  const runtimeContext = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(runtimeContext);
  const dispatch = (command: ClientOrchestrationCommand) =>
    runPromise(session.client[ORCHESTRATION_WS_METHODS.dispatchCommand](command));
  return {
    client: new T3ThreadClient(tracker, threadId, input.turnTimeoutMs, dispatch),
    streamFiber,
    tracker,
  };
});
