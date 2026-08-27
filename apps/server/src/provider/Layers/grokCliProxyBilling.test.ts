import { assert, describe, it } from "@effect/vitest";

import { pickGrokAuthCredential, resolveGrokAuthFilePath } from "./grokCliProxyBilling.ts";

describe("pickGrokAuthCredential", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");

  it("prefers the SuperGrok auth.x.ai bearer and ignores the refresh token", () => {
    const credential = pickGrokAuthCredential(
      {
        "https://accounts.x.ai/sign-in": {
          key: "legacy-token",
          expires_at: "2026-09-01T00:00:00.000Z",
        },
        "https://auth.x.ai::client": {
          key: "supergrok-token",
          refresh_token: "refresh-secret",
          expires_at: "2026-09-01T00:00:00.000Z",
          user_id: "user-1",
        },
      },
      now,
    );

    assert.deepStrictEqual(credential, { token: "supergrok-token", userId: "user-1" });
  });

  it("skips expired tokens instead of inventing a credential", () => {
    assert.isUndefined(
      pickGrokAuthCredential(
        {
          "https://auth.x.ai::client": {
            key: "expired-token",
            expires_at: "2026-08-01T00:00:00.000Z",
          },
        },
        now,
      ),
    );
    assert.isUndefined(pickGrokAuthCredential({}, now));
    assert.isUndefined(pickGrokAuthCredential(undefined, now));
  });
});

describe("resolveGrokAuthFilePath", () => {
  it("uses GROK_HOME when set", () => {
    assert.strictEqual(
      resolveGrokAuthFilePath({ GROK_HOME: "/tmp/isolated-grok" }),
      "/tmp/isolated-grok/auth.json",
    );
  });
});
