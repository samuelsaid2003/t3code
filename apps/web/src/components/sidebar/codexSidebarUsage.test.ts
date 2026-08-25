import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import { resolveCodexSidebarUsageLabel } from "./codexSidebarUsage.ts";

describe("resolveCodexSidebarUsageLabel", () => {
  it("uses Codex's reported subscription percent, not a computed token cost", () => {
    expect(
      resolveCodexSidebarUsageLabel([
        {
          driver: ProviderDriverKind.make("claude"),
          subscriptionUsedPercent: 12,
        },
        {
          driver: ProviderDriverKind.make("codex"),
          subscriptionUsedPercent: 73,
        },
      ]),
    ).toBe("Codex Usage: 73%");
  });

  it("hides the row when Codex has not reported a percent", () => {
    expect(
      resolveCodexSidebarUsageLabel([
        { driver: ProviderDriverKind.make("codex") },
        { driver: ProviderDriverKind.make("claude"), subscriptionUsedPercent: 40 },
      ]),
    ).toBeNull();
  });
});
