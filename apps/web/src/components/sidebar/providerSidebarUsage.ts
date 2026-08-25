import type { ServerProvider } from "@t3tools/contracts";

export function resolveProviderSidebarUsageLabel(
  provider: Pick<ServerProvider, "driver" | "subscriptionUsedPercent">,
): string | null {
  const providerName =
    provider.driver === "codex" ? "Codex" : provider.driver === "claude" ? "Claude" : undefined;
  if (!providerName) {
    return null;
  }

  const usedPercent = provider.subscriptionUsedPercent;
  if (typeof usedPercent !== "number") {
    return null;
  }
  const remainingPercent = 100 - Math.min(100, Math.max(0, Math.round(usedPercent)));
  return `${providerName} Usage: ${remainingPercent}% remaining`;
}
