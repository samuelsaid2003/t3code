import { assert, describe, it } from "@effect/vitest";

import {
  extractGrokSubscriptionUsage,
  extractGrokSubscriptionUsedPercent,
} from "./grokSubscriptionUsage.ts";

describe("extractGrokSubscriptionUsedPercent", () => {
  it("reads SuperGrok creditUsagePercent from the credits-config shape", () => {
    assert.strictEqual(
      extractGrokSubscriptionUsedPercent({
        config: {
          creditUsagePercent: 42.5,
          currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-08T00:00:00Z",
          },
        },
        subscriptionTier: "SuperGrok",
      }),
      43,
    );
  });

  it("falls back to included used/limit cents when the percent is absent", () => {
    assert.strictEqual(
      extractGrokSubscriptionUsedPercent({
        monthlyLimit: { val: 2000 },
        usage: { totalUsed: { val: 500 }, includedUsed: { val: 500 } },
        billingCycle: { billingPeriodEnd: "2026-06-08T00:00:00Z" },
      }),
      25,
    );
  });

  it("does not invent a percent from missing or non-numeric windows", () => {
    assert.isUndefined(extractGrokSubscriptionUsedPercent(undefined));
    assert.isUndefined(extractGrokSubscriptionUsedPercent({}));
    assert.isUndefined(extractGrokSubscriptionUsedPercent({ config: {} }));
    assert.isUndefined(
      extractGrokSubscriptionUsedPercent({
        config: { creditUsagePercent: null, onDemandUsed: { val: 300 }, onDemandCap: { val: 500 } },
      }),
    );
  });

  it("clamps out-of-range percents Grok may report", () => {
    assert.strictEqual(
      extractGrokSubscriptionUsedPercent({ config: { creditUsagePercent: -4.2 } }),
      0,
    );
    assert.strictEqual(
      extractGrokSubscriptionUsedPercent({ config: { creditUsagePercent: 140.8 } }),
      100,
    );
  });
});

describe("extractGrokSubscriptionUsage", () => {
  it("maps a weekly SuperGrok window with reset time", () => {
    assert.deepStrictEqual(
      extractGrokSubscriptionUsage({
        config: {
          creditUsagePercent: 72.6,
          currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            start: "2026-08-20T05:00:00Z",
            end: "2026-08-27T05:00:00Z",
          },
        },
      }),
      {
        weekly: {
          usedPercent: 73,
          durationMins: 7 * 24 * 60,
          resetsAt: "2026-08-27T05:00:00.000Z",
        },
      },
    );
  });

  it("maps a non-weekly window onto the current slot", () => {
    assert.deepStrictEqual(
      extractGrokSubscriptionUsage({
        config: {
          creditUsagePercent: 19.2,
          currentPeriod: {
            type: "USAGE_PERIOD_TYPE_MONTHLY",
            start: "2026-08-01T00:00:00Z",
            end: "2026-09-01T00:00:00Z",
          },
        },
      }),
      {
        current: {
          usedPercent: 19,
          durationMins: 31 * 24 * 60,
          resetsAt: "2026-09-01T00:00:00.000Z",
        },
      },
    );
  });
});
