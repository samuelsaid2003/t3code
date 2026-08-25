import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveProviderSidebarUsageLabel } from "./providerSidebarUsage.ts";

describe("resolveProviderSidebarUsageLabel", () => {
  it("shows the remaining share of Codex's reported subscription window", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("codex"),
        subscriptionUsedPercent: 73,
      }),
    ).toBe("Codex Usage: 27% remaining");
  });

  it("shows the remaining share of Claude's five-hour subscription window", () => {
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

  it("hides the row when a provider has not reported a percent", () => {
    expect(
      resolveProviderSidebarUsageLabel({ driver: ProviderDriverKind.make("codex") }),
    ).toBeNull();
  });

  it("hides usage for providers without a reliable subscription allowance", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("grok"),
        subscriptionUsedPercent: 40,
      }),
    ).toBeNull();
  });

  it("does not mistake an unknown Claude-like driver for Claude Code", () => {
    expect(
      resolveProviderSidebarUsageLabel({
        driver: ProviderDriverKind.make("claude"),
        subscriptionUsedPercent: 40,
      }),
    ).toBeNull();
  });
});
