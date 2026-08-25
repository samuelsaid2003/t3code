import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatProviderUsageReset,
  resolveClaudeSidebarUsage,
  resolveProviderSidebarUsageLabel,
} from "./providerSidebarUsage.ts";

describe("resolveProviderSidebarUsageLabel", () => {
  it("keeps the existing Codex percentage-remaining label", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("codex"),
        subscriptionUsedPercent: 73,
      }),
    ).toBe("Codex Usage: 27% remaining");
  });

  it("provides a Claude fallback when only the primary percentage is available", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("claudeAgent"),
        subscriptionUsedPercent: 12,
      }),
    ).toBe("Claude Usage: 88% remaining");
  });

  it("clamps the reported percentage before deriving the remainder", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("codex"),
        subscriptionUsedPercent: 140,
      }),
    ).toBe("Codex Usage: 0% remaining");
  });

  it("hides missing and unsupported provider usage", () => {
    expect(
      resolveProviderSidebarUsageLabel({ driver: ProviderDriverKind.make("codex") }),
    ).toBeNull();
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("grok"),
        subscriptionUsedPercent: 40,
      }),
    ).toBeNull();
  });
});

describe("resolveClaudeSidebarUsage", () => {
  it("shows Claude current and weekly windows as percentages remaining", () => {
    expect(
      resolveClaudeSidebarUsage({
        driver: ProviderDriverKind.make("claudeAgent"),
        subscriptionUsage: {
          current: {
            usedPercent: 73,
            durationMins: 300,
            resetsAt: "2026-08-25T05:01:00.000Z",
          },
          weekly: { usedPercent: 19, durationMins: 10_080 },
        },
      }),
    ).toEqual({
      metrics: [
        {
          id: "current",
          label: "5-hour limit",
          remainingPercent: 27,
          resetsAt: "2026-08-25T05:01:00.000Z",
        },
        { id: "weekly", label: "Weekly · all models", remainingPercent: 81 },
      ],
    });
  });

  it("does not apply the Claude meter presentation to Codex", () => {
    expect(
      resolveClaudeSidebarUsage({
        driver: ProviderDriverKind.make("codex"),
        subscriptionUsage: { current: { usedPercent: 73, durationMins: 300 } },
      }),
    ).toBeNull();
  });
});

describe("formatProviderUsageReset", () => {
  it("uses a compact relative label for nearby resets", () => {
    expect(
      formatProviderUsageReset("2026-08-25T05:01:00.000Z", Date.parse("2026-08-25T05:00:00Z")),
    ).toBe("Resets in 1 min");
  });

  it("hides missing and malformed reset times", () => {
    expect(formatProviderUsageReset(undefined)).toBeNull();
    expect(formatProviderUsageReset("not-a-date")).toBeNull();
  });
});
