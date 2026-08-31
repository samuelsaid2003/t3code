// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Local credential-file and OAuth adapter boundary.
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  AuthAccessTokenType,
  AuthEnvironmentBootstrapTokenType,
  AuthTokenExchangeGrantType,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));

const EnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: NonEmptyString,
});

const AccessTokenResponse = Schema.Struct({
  access_token: NonEmptyString,
  expires_in: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  scope: NonEmptyString,
  token_type: Schema.Literal("Bearer"),
});

const WebSocketTicketResponse = Schema.Struct({
  ticket: NonEmptyString,
  expiresAt: NonEmptyString,
});

export const T3AuthState = Schema.Struct({
  version: Schema.Literal(1),
  environmentId: EnvironmentId,
  label: NonEmptyString,
  httpBaseUrl: NonEmptyString,
  wsBaseUrl: NonEmptyString,
  accessToken: NonEmptyString,
  expiresAt: NonEmptyString,
  scopes: Schema.Array(NonEmptyString),
});
export type T3AuthState = typeof T3AuthState.Type;

const REQUIRED_SCOPES = ["orchestration:read", "orchestration:operate"] as const;

export interface PairingTarget {
  readonly credential: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

export function parsePairingUrl(pairingUrl: string): PairingTarget {
  const url = new URL(pairingUrl.trim());
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const credential = fragment.get("token")?.trim();
  if (!credential) {
    throw new Error("The T3 pairing URL does not contain a token in its fragment.");
  }

  const httpBaseUrl = new URL(url.origin);
  const wsBaseUrl = new URL(url.origin);
  wsBaseUrl.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  wsBaseUrl.pathname = "/ws";

  return {
    credential,
    httpBaseUrl: httpBaseUrl.toString(),
    wsBaseUrl: wsBaseUrl.toString(),
  };
}

async function requireOk(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  throw new Error(`${operation} failed with HTTP ${String(response.status)}.`);
}

export async function exchangePairingUrl(
  pairingUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T3AuthState> {
  const target = parsePairingUrl(pairingUrl);
  const descriptorResponse = await requireOk(
    await fetchImpl(new URL("/.well-known/t3/environment", target.httpBaseUrl)),
    "T3 environment discovery",
  );
  const descriptor = Schema.decodeUnknownSync(EnvironmentDescriptor)(
    await descriptorResponse.json(),
  );

  const form = new URLSearchParams({
    grant_type: AuthTokenExchangeGrantType,
    subject_token: target.credential,
    subject_token_type: AuthEnvironmentBootstrapTokenType,
    requested_token_type: AuthAccessTokenType,
    scope: REQUIRED_SCOPES.join(" "),
    client_label: "TradeWiz Slack bridge",
    client_device_type: "bot",
  });
  const tokenResponse = await requireOk(
    await fetchImpl(new URL("/oauth/token", target.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    }),
    "T3 pairing exchange",
  );
  const access = Schema.decodeUnknownSync(AccessTokenResponse)(await tokenResponse.json());

  return Schema.decodeUnknownSync(T3AuthState)({
    version: 1,
    environmentId: descriptor.environmentId,
    label: descriptor.label,
    httpBaseUrl: target.httpBaseUrl,
    wsBaseUrl: target.wsBaseUrl,
    accessToken: access.access_token,
    expiresAt: new Date(Date.now() + access.expires_in * 1_000).toISOString(),
    scopes: access.scope.split(/\s+/).filter(Boolean),
  });
}

export async function saveT3AuthState(path: string, state: T3AuthState): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

export async function loadT3AuthState(path: string): Promise<T3AuthState> {
  const contents = await readFile(path, "utf8");
  const state = Schema.decodeUnknownSync(T3AuthState)(JSON.parse(contents));
  if (Date.parse(state.expiresAt) <= Date.now() + 60_000) {
    throw new Error("The saved T3 access token has expired. Run the T3 pairing command again.");
  }
  for (const scope of REQUIRED_SCOPES) {
    if (!state.scopes.includes(scope)) {
      throw new Error(`The saved T3 access token is missing the ${scope} scope.`);
    }
  }
  return state;
}

export async function issueWebSocketUrl(
  state: T3AuthState,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await requireOk(
    await fetchImpl(new URL("/api/auth/websocket-ticket", state.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${state.accessToken}` },
    }),
    "T3 WebSocket authorization",
  );
  const ticket = Schema.decodeUnknownSync(WebSocketTicketResponse)(await response.json());
  const socketUrl = new URL(state.wsBaseUrl);
  socketUrl.searchParams.set("wsTicket", ticket.ticket);
  socketUrl.searchParams.set("connectionMethod", "direct");
  return socketUrl.toString();
}
