import { fileURLToPath } from "node:url";

import * as Schema from "effect/Schema";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const PositiveIntegerFromString = Schema.NumberFromString.check(Schema.isInt()).check(
  Schema.isGreaterThan(0),
);

const BridgeEnvironment = Schema.Struct({
  SLACK_APP_TOKEN: NonEmptyString,
  SLACK_BOT_TOKEN: NonEmptyString,
  SLACK_ALLOWED_USER_ID: NonEmptyString,
  T3_THREAD_ID: NonEmptyString,
  T3_AUTH_STATE_FILE: Schema.optionalKey(NonEmptyString),
  T3_TURN_TIMEOUT_MS: Schema.optionalKey(NonEmptyString),
});

export interface BridgeConfig {
  readonly slackAppToken: string;
  readonly slackBotToken: string;
  readonly slackAllowedUserId: string;
  readonly t3ThreadId: string;
  readonly t3AuthStateFile: string;
  readonly t3TurnTimeoutMs: number;
}

const DEFAULT_AUTH_STATE_FILE = fileURLToPath(new URL("../state/t3-auth.json", import.meta.url));
const DEFAULT_TURN_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const decoded = Schema.decodeUnknownSync(BridgeEnvironment)(environment);
  return {
    slackAppToken: decoded.SLACK_APP_TOKEN,
    slackBotToken: decoded.SLACK_BOT_TOKEN,
    slackAllowedUserId: decoded.SLACK_ALLOWED_USER_ID,
    t3ThreadId: decoded.T3_THREAD_ID,
    t3AuthStateFile: decoded.T3_AUTH_STATE_FILE ?? DEFAULT_AUTH_STATE_FILE,
    t3TurnTimeoutMs:
      decoded.T3_TURN_TIMEOUT_MS === undefined
        ? DEFAULT_TURN_TIMEOUT_MS
        : Schema.decodeUnknownSync(PositiveIntegerFromString)(decoded.T3_TURN_TIMEOUT_MS),
  };
}
