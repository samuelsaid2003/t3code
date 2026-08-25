import type { ServerProvider } from "@t3tools/contracts";

export function resolveCodexSidebarUsageLabel(
  providers: ReadonlyArray<Pick<ServerProvider, "driver" | "subscriptionUsedPercent">>,
): string | null {
  const usedPercent = providers.find(
    (provider) =>
      provider.driver === "codex" && typeof provider.subscriptionUsedPercent === "number",
  )?.subscriptionUsedPercent;
  if (typeof usedPercent !== "number") {
    return null;
  }
  const remainingPercent = 100 - Math.min(100, Math.max(0, Math.round(usedPercent)));
  return `Codex Usage: ${remainingPercent}% remaining`;
}
