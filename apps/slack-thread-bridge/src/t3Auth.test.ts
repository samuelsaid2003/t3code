// @effect-diagnostics globalDate:off -- Tests validate access-token expiry produced from wall-clock time.
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { exchangePairingUrl, issueWebSocketUrl, parsePairingUrl } from "./t3Auth.ts";

describe("T3 authentication", () => {
  it("extracts the one-time token without placing it in the server URL", () => {
    expect(parsePairingUrl("http://127.0.0.1:3773/pair#token=one-time-secret")).toEqual({
      credential: "one-time-secret",
      httpBaseUrl: "http://127.0.0.1:3773/",
      wsBaseUrl: "ws://127.0.0.1:3773/ws",
    });
  });

  it("exchanges only the two orchestration scopes", async () => {
    const requests: Array<{ readonly body?: string; readonly url: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, ...(init?.body === undefined ? {} : { body: String(init.body) }) });
      if (url.endsWith("/.well-known/t3/environment")) {
        return new Response(JSON.stringify({ environmentId: "env-1", label: "Samuel's T3" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          access_token: "scoped-access-token",
          expires_in: 3600,
          scope: "orchestration:read orchestration:operate",
          token_type: "Bearer",
        }),
        { status: 200 },
      );
    });

    const state = await exchangePairingUrl(
      "http://127.0.0.1:3773/pair#token=one-time-secret",
      fetchImpl,
    );
    expect(state.accessToken).toBe("scoped-access-token");
    expect(state.scopes).toEqual(["orchestration:read", "orchestration:operate"]);
    expect(requests[1]?.body).toContain("scope=orchestration%3Aread+orchestration%3Aoperate");
  });

  it("puts only a short-lived ticket in the WebSocket URL", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ authorization: "Bearer long-lived-token" });
      return new Response(
        JSON.stringify({ ticket: "short-ticket", expiresAt: "2026-09-01T00:00:00.000Z" }),
        { status: 200 },
      );
    });
    const url = await issueWebSocketUrl(
      {
        version: 1,
        environmentId: EnvironmentId.make("env-1"),
        label: "Samuel's T3",
        httpBaseUrl: "http://127.0.0.1:3773/",
        wsBaseUrl: "ws://127.0.0.1:3773/ws",
        accessToken: "long-lived-token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        scopes: ["orchestration:read", "orchestration:operate"],
      },
      fetchImpl,
    );
    expect(url).toContain("wsTicket=short-ticket");
    expect(url).not.toContain("long-lived-token");
  });
});
