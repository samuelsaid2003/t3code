import type { ServerProvider } from "@t3tools/contracts";

export type ClaudeSidebarUsageMetric = {
  readonly id: "current" | "weekly";
  readonly label: string;
  readonly remainingPercent: number;
  readonly resetsAt?: string;
};

export type ClaudeSidebarUsage = {
  readonly metrics: ReadonlyArray<ClaudeSidebarUsageMetric>;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function currentWindowLabel(durationMins: number | undefined): string {
  if (durationMins === 5 * 60) return "5-hour limit";
  if (durationMins && durationMins % 60 === 0) return `${durationMins / 60}-hour limit`;
  return "Current limit";
}

export function resolveProviderSidebarUsageLabel(
  provider: Pick<ServerProvider, "driver" | "subscriptionUsedPercent">,
): string | null {
  const providerName =
    provider.driver === "codex"
      ? "Codex"
      : provider.driver === "claudeAgent"
        ? "Claude"
        : undefined;
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

export function resolveClaudeSidebarUsage(
  provider: Pick<ServerProvider, "driver" | "subscriptionUsage">,
): ClaudeSidebarUsage | null {
  if (provider.driver !== "claudeAgent" || !provider.subscriptionUsage) return null;

  const { current, weekly } = provider.subscriptionUsage;
  const metrics: Array<ClaudeSidebarUsageMetric> = [];
  if (current) {
    metrics.push({
      id: "current",
      label: currentWindowLabel(current.durationMins),
      remainingPercent: 100 - clampPercent(current.usedPercent),
      ...(current.resetsAt ? { resetsAt: current.resetsAt } : {}),
    });
  }
  if (weekly) {
    metrics.push({
      id: "weekly",
      label: "Weekly · all models",
      remainingPercent: 100 - clampPercent(weekly.usedPercent),
      ...(weekly.resetsAt ? { resetsAt: weekly.resetsAt } : {}),
    });
  }

  return metrics.length > 0 ? { metrics } : null;
}

export function formatProviderUsageReset(
  resetsAt: string | undefined,
  nowMilliseconds = Date.now(),
): string | null {
  if (!resetsAt) return null;
  const resetMilliseconds = Date.parse(resetsAt);
  if (!Number.isFinite(resetMilliseconds)) return null;

  const remainingMinutes = Math.ceil((resetMilliseconds - nowMilliseconds) / 60_000);
  if (remainingMinutes > 0 && remainingMinutes < 60) {
    return `Resets in ${remainingMinutes} min`;
  }
  if (remainingMinutes <= 0) return "Reset pending";

  return `Resets ${new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(resetMilliseconds)}`;
}
