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
  return `Codex Usage: ${usedPercent}%`;
}
