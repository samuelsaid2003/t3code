type ClaudeUsageResponse = {
  readonly rate_limits_available?: unknown;
  readonly rate_limits?: {
    readonly five_hour?: {
      readonly utilization?: unknown;
    } | null;
  } | null;
};

/**
 * Pull the primary five-hour claude.ai plan utilization reported by Claude Code.
 * The SDK API is experimental, so this parser deliberately accepts unknown input
 * and treats missing or changed fields as unavailable.
 */
export function extractClaudeSubscriptionUsedPercent(input: unknown): number | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const usage = input as ClaudeUsageResponse;
  if (usage.rate_limits_available === false) {
    return undefined;
  }

  const usedPercent = usage.rate_limits?.five_hour?.utilization;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, Math.round(usedPercent)));
}
