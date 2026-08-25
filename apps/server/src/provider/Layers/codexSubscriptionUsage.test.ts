import { assert, describe, it } from "@effect/vitest";

import { extractCodexSubscriptionUsedPercent } from "./codexSubscriptionUsage.ts";

describe("extractCodexSubscriptionUsedPercent", () => {
  it("reads Codex's primary subscription window percent", () => {
    assert.strictEqual(
      extractCodexSubscriptionUsedPercent({
        rateLimits: { primary: { usedPercent: 73 } },
      }),
      73,
    );
  });

  it("does not invent a percent from missing or non-numeric windows", () => {
    assert.isUndefined(extractCodexSubscriptionUsedPercent({}));
    assert.isUndefined(extractCodexSubscriptionUsedPercent({ rateLimits: {} }));
    assert.isUndefined(
      extractCodexSubscriptionUsedPercent({ rateLimits: { primary: { usedPercent: null } } }),
    );
  });

  it("clamps out-of-range percents Codex may report", () => {
    assert.strictEqual(
      extractCodexSubscriptionUsedPercent({ rateLimits: { primary: { usedPercent: -4.2 } } }),
      0,
    );
    assert.strictEqual(
      extractCodexSubscriptionUsedPercent({ rateLimits: { primary: { usedPercent: 140.8 } } }),
      100,
    );
  });
});
