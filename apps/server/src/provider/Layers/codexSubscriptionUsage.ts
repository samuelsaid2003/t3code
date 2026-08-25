/**
 * Pull the ChatGPT-subscription usage percent Codex itself reports.
 * This is `rateLimits.primary.usedPercent` from `account/rateLimits/read`,
 * not a token-cost ratio computed from session history.
 */
export function extractCodexSubscriptionUsedPercent(input: {
  readonly rateLimits?: {
    readonly primary?: { readonly usedPercent?: number | null } | null;
  } | null;
}): number | undefined {
  const usedPercent = input.rateLimits?.primary?.usedPercent;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return undefined;
  }
  return Math.min(100, Math.max(0, Math.round(usedPercent)));
}
