import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { rpcSessionFactoryLayer } from "@t3tools/client-runtime/rpc";
import { MessageId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Socket from "effect/unstable/socket/Socket";

import { loadConfig } from "./config.ts";
import { safeErrorMessage } from "./errors.ts";
import { resolveProactiveSlackDelivery } from "./proactive.ts";
import { recordSlackDeliveryWithRetry, SlackGateway } from "./slack.ts";
import { loadT3AuthState } from "./t3Auth.ts";
import { connectT3Thread } from "./t3ThreadClient.ts";

const program = Effect.gen(function* () {
  const config = loadConfig();
  const auth = yield* Effect.promise(() => loadT3AuthState(config.t3AuthStateFile));
  const connection = yield* connectT3Thread({
    auth,
    threadId: config.t3ThreadId,
    turnTimeoutMs: config.t3TurnTimeoutMs,
  });

  const slack = new SlackGateway({
    appToken: config.slackAppToken,
    botToken: config.slackBotToken,
    allowedUserId: config.slackAllowedUserId,
    ask: (text, sourceId, onAssistantText) =>
      connection.client.ask(text, sourceId, onAssistantText),
    markDelivered: (messageId, sourceId) =>
      connection.client.recordSlackDelivery(MessageId.make(messageId), sourceId),
  });
  yield* Effect.acquireRelease(
    Effect.promise(async () => {
      await slack.start();
      return slack;
    }),
    (gateway) => Effect.promise(() => gateway.stop()),
  );
  yield* Effect.log(`The General is connected to T3 thread ${config.t3ThreadId}.`);

  const forwardedRuns = new Set<string>();
  const unsubscribe = connection.tracker.subscribe((event) => {
    const delivery = resolveProactiveSlackDelivery(event, connection.tracker);
    if (delivery !== null && !forwardedRuns.has(delivery.id)) {
      forwardedRuns.add(delivery.id);
      void slack
        .sendDirectMessage(delivery.text)
        .then(() =>
          delivery.messageId === undefined
            ? undefined
            : recordSlackDeliveryWithRetry(
                (messageId, sourceId) =>
                  connection.client.recordSlackDelivery(MessageId.make(messageId), sourceId),
                delivery.messageId,
                `routine:${delivery.id}`,
              ),
        )
        .catch((error) => {
          forwardedRuns.delete(delivery.id);
          process.stderr.write(
            `Could not forward the scheduled routine to Slack: ${safeErrorMessage(error)}\n`,
          );
        });
    }
  });
  yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));

  yield* Fiber.join(connection.streamFiber);
}).pipe(Effect.scoped);

const liveLayer = rpcSessionFactoryLayer.pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
);

NodeRuntime.runMain(program.pipe(Effect.provide(liveLayer)));
