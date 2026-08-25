import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import { resolveCodexSidebarUsageLabel } from "./codexSidebarUsage.ts";

describe("resolveCodexSidebarUsageLabel", () => {
  it("shows the remaining share of Codex's reported subscription window", () => {
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
    ).toBe("Codex Usage: 27% remaining");
  });

  it("clamps the reported percentage before deriving the remainder", () => {
    expect(
      resolveCodexSidebarUsageLabel([
        {
          driver: ProviderDriverKind.make("codex"),
          subscriptionUsedPercent: 140,
        },
      ]),
    ).toBe("Codex Usage: 0% remaining");
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
