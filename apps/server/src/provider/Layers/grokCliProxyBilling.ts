import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);

const DEFAULT_GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const GROK_BILLING_TIMEOUT_MS = 8_000;

export type GrokAuthCredential = {
  readonly token: string;
  readonly userId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Record<string, unknown>;
}

function isExpired(expiresAt: unknown, nowMilliseconds: number): boolean {
  if (typeof expiresAt !== "string") return false;
  const expiresAtMilliseconds = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMilliseconds) && expiresAtMilliseconds <= nowMilliseconds;
}

function credentialFromEntry(
  entry: unknown,
  nowMilliseconds: number,
): GrokAuthCredential | undefined {
  const record = asRecord(entry);
  const token = typeof record?.key === "string" ? record.key.trim() : "";
  if (!record || token.length === 0 || isExpired(record.expires_at, nowMilliseconds)) {
    return undefined;
  }
  const userId = typeof record.user_id === "string" ? record.user_id.trim() : "";
  return {
    token,
    ...(userId.length > 0 ? { userId } : {}),
  };
}

/**
 * Pick the SuperGrok OAuth bearer grok CLI already cached. Prefer the
 * `auth.x.ai` entry, then any other non-expired token. Never returns the
 * refresh token.
 */
export function pickGrokAuthCredential(
  authFile: unknown,
  nowMilliseconds: number,
): GrokAuthCredential | undefined {
  const root = asRecord(authFile);
  if (!root) return undefined;

  const preferred: Array<unknown> = [];
  const fallback: Array<unknown> = [];
  for (const [key, entry] of Object.entries(root)) {
    if (key.startsWith("https://auth.x.ai")) preferred.push(entry);
    else fallback.push(entry);
  }

  for (const entry of [...preferred, ...fallback]) {
    const credential = credentialFromEntry(entry, nowMilliseconds);
    if (credential) return credential;
  }
  return undefined;
}

export function resolveGrokAuthFilePath(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const grokHome = environment.GROK_HOME?.trim();
  if (grokHome) return `${grokHome.replace(/\/+$/, "")}/auth.json`;
  const home = environment.HOME?.trim();
  if (!home) return undefined;
  return `${home.replace(/\/+$/, "")}/.grok/auth.json`;
}

function resolveGrokBillingUrl(environment: NodeJS.ProcessEnv): string {
  const base = environment.CLI_CHAT_PROXY_BASE_URL?.trim();
  if (!base) return DEFAULT_GROK_BILLING_URL;
  return `${base.replace(/\/+$/, "")}/billing?format=credits`;
}

/**
 * SuperGrok weekly pool from the same CLI-proxy credits URL grok's `/usage`
 * command uses. Used when `grok agent stdio` does not expose `x.ai/billing`.
 */
export const fetchGrokCliProxyBilling = (
  environment: NodeJS.ProcessEnv = process.env,
): Effect.Effect<unknown | undefined, never, FileSystem.FileSystem | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const authPath = resolveGrokAuthFilePath(environment);
    if (!authPath) return undefined;

    const fileSystem = yield* FileSystem.FileSystem;
    const nowMilliseconds = yield* Clock.currentTimeMillis;
    const encoded = yield* fileSystem.readFileString(authPath).pipe(Effect.option);
    if (Option.isNone(encoded)) return undefined;

    const parsed = yield* Schema.decodeUnknownEffect(UnknownFromJsonString)(encoded.value).pipe(
      Effect.option,
    );
    if (Option.isNone(parsed)) return undefined;

    const credential = pickGrokAuthCredential(parsed.value, nowMilliseconds);
    if (!credential) return undefined;

    const httpClient = yield* HttpClient.HttpClient;
    let request = HttpClientRequest.get(resolveGrokBillingUrl(environment)).pipe(
      HttpClientRequest.bearerToken(credential.token),
      HttpClientRequest.setHeader("x-xai-token-auth", "xai-grok-cli"),
      HttpClientRequest.setHeader("accept", "application/json"),
    );
    if (credential.userId) {
      request = request.pipe(HttpClientRequest.setHeader("x-userid", credential.userId));
    }

    const response = yield* httpClient.execute(request).pipe(
      Effect.timeoutOption(GROK_BILLING_TIMEOUT_MS),
      Effect.orElseSucceed(() => Option.none()),
    );
    if (Option.isNone(response)) return undefined;
    if (response.value.status < 200 || response.value.status >= 300) return undefined;
    return yield* response.value.json.pipe(Effect.orElseSucceed(() => undefined));
  });
