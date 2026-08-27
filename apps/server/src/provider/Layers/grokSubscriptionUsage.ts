/**
 * Pull SuperGrok subscription remaining from Grok's `x.ai/billing` response.
 * This is the provider-reported credit pool percent, not a token-cost ratio
 * computed from session history.
 */
import type { ServerProviderSubscriptionUsage } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const WEEKLY_DURATION_MINS = 7 * 24 * 60;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Record<string, unknown>;
}

function normalizePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeResetTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return Option.map(DateTime.make(value), DateTime.formatIso).pipe(Option.getOrUndefined);
}

function readCent(value: unknown): number | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const amount = record.val;
  if (typeof amount === "number" && Number.isFinite(amount)) return amount;
  return undefined;
}

function ratioPercent(used: number | undefined, limit: number | undefined): number | undefined {
  if (used === undefined || limit === undefined || limit <= 0) return undefined;
  return normalizePercent((used / limit) * 100);
}

function periodDurationMins(period: Record<string, unknown> | undefined): number | undefined {
  const start = typeof period?.start === "string" ? Date.parse(period.start) : Number.NaN;
  const end = typeof period?.end === "string" ? Date.parse(period.end) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  const durationMins = Math.round((end - start) / 60_000);
  return durationMins > 0 ? durationMins : undefined;
}

function isWeeklyPeriod(periodType: unknown, durationMins: number | undefined): boolean {
  if (typeof periodType === "string" && periodType.toUpperCase().includes("WEEKLY")) {
    return true;
  }
  return durationMins !== undefined && durationMins >= 4 * 24 * 60 && durationMins <= 12 * 24 * 60;
}

function readUsedPercent(root: Record<string, unknown>): number | undefined {
  const config = asRecord(root.config);
  const fromCredits = normalizePercent(config?.creditUsagePercent);
  if (fromCredits !== undefined) return fromCredits;

  const usage = asRecord(root.usage);
  return (
    ratioPercent(readCent(config?.used), readCent(config?.monthlyLimit)) ??
    ratioPercent(readCent(usage?.totalUsed), readCent(root.monthlyLimit)) ??
    ratioPercent(readCent(usage?.includedUsed), readCent(root.monthlyLimit))
  );
}

function readResetsAt(root: Record<string, unknown>): string | undefined {
  const config = asRecord(root.config);
  const period = asRecord(config?.currentPeriod);
  const billingCycle = asRecord(root.billingCycle);
  return (
    normalizeResetTime(period?.end) ??
    normalizeResetTime(config?.billingPeriodEnd) ??
    normalizeResetTime(billingCycle?.billingPeriodEnd)
  );
}

/**
 * Pull Grok's current SuperGrok / Grok Build credit window from the
 * `x.ai/billing` ACP response. The CLI surface is still evolving, so this
 * parser accepts unknown input and treats missing fields as unavailable.
 */
export function extractGrokSubscriptionUsage(
  input: unknown,
): ServerProviderSubscriptionUsage | undefined {
  const root = asRecord(input);
  if (!root) return undefined;

  const usedPercent = readUsedPercent(root);
  if (usedPercent === undefined) return undefined;

  const config = asRecord(root.config);
  const period = asRecord(config?.currentPeriod);
  const durationMins = periodDurationMins(period) ?? WEEKLY_DURATION_MINS;
  const resetsAt = readResetsAt(root);
  const window = {
    usedPercent,
    durationMins,
    ...(resetsAt ? { resetsAt } : {}),
  };

  if (isWeeklyPeriod(period?.type ?? period?.periodType, periodDurationMins(period))) {
    return { weekly: window };
  }
  return { current: window };
}

export function extractGrokSubscriptionUsedPercent(input: unknown): number | undefined {
  const usage = extractGrokSubscriptionUsage(input);
  return usage?.weekly?.usedPercent ?? usage?.current?.usedPercent;
}
