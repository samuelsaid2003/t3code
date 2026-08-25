import { assert, describe, it } from "@effect/vitest";

import { extractClaudeSubscriptionUsedPercent } from "./claudeSubscriptionUsage.ts";

describe("extractClaudeSubscriptionUsedPercent", () => {
  it("reads Claude's five-hour subscription window percent", () => {
    assert.strictEqual(
      extractClaudeSubscriptionUsedPercent({
        rate_limits_available: true,
        rate_limits: { five_hour: { utilization: 64.6, resets_at: "2026-08-25T12:00:00Z" } },
      }),
      65,
    );
  });

  it("does not invent a percent when plan limits are unavailable or malformed", () => {
    assert.isUndefined(extractClaudeSubscriptionUsedPercent(undefined));
    assert.isUndefined(
      extractClaudeSubscriptionUsedPercent({
        rate_limits_available: false,
        rate_limits: { five_hour: { utilization: 30 } },
      }),
    );
    assert.isUndefined(
      extractClaudeSubscriptionUsedPercent({
        rate_limits_available: true,
        rate_limits: { five_hour: { utilization: null } },
      }),
    );
  });

  it("clamps out-of-range utilization from the experimental API", () => {
    assert.strictEqual(
      extractClaudeSubscriptionUsedPercent({
        rate_limits: { five_hour: { utilization: -4.2 } },
      }),
      0,
    );
    assert.strictEqual(
      extractClaudeSubscriptionUsedPercent({
        rate_limits: { five_hour: { utilization: 140.8 } },
      }),
      100,
    );
  });
});
