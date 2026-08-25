import { assert, describe, it } from "@effect/vitest";

import {
  extractClaudeSubscriptionUsage,
  extractClaudeSubscriptionUsedPercent,
} from "./claudeSubscriptionUsage.ts";

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

  it("reads current and weekly windows with normalized reset times", () => {
    assert.deepStrictEqual(
      extractClaudeSubscriptionUsage({
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 72.6, resets_at: "2026-08-25T05:01:00Z" },
          seven_day: { utilization: 18.7, resets_at: "2026-08-31T05:00:00Z" },
        },
      }),
      {
        current: {
          usedPercent: 73,
          durationMins: 300,
          resetsAt: "2026-08-25T05:01:00.000Z",
        },
        weekly: {
          usedPercent: 19,
          durationMins: 10_080,
          resetsAt: "2026-08-31T05:00:00.000Z",
        },
      },
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
