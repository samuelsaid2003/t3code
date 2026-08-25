import type { ServerProviderSubscriptionUsage } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

type ClaudeUsageWindow = {
  readonly utilization?: unknown;
  readonly resets_at?: unknown;
};

type ClaudeUsageResponse = {
  readonly rate_limits_available?: unknown;
  readonly rate_limits?: {
    readonly five_hour?: ClaudeUsageWindow | null;
    readonly seven_day?: ClaudeUsageWindow | null;
  } | null;
};

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

function normalizeWindow(
  input: ClaudeUsageWindow | null | undefined,
  durationMins: number,
): ServerProviderSubscriptionUsage["current"] | undefined {
  const usedPercent = normalizePercent(input?.utilization);
  if (usedPercent === undefined) return undefined;
  const resetsAt = normalizeResetTime(input?.resets_at);
  return {
    usedPercent,
    durationMins,
    ...(resetsAt ? { resetsAt } : {}),
  };
}

/**
 * Pull Claude's current and weekly claude.ai allowance windows from the
 * experimental SDK usage response.
 */
export function extractClaudeSubscriptionUsage(
  input: unknown,
): ServerProviderSubscriptionUsage | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const usage = input as ClaudeUsageResponse;
  if (usage.rate_limits_available === false) {
    return undefined;
  }

  const current = normalizeWindow(usage.rate_limits?.five_hour, 5 * 60);
  const weekly = normalizeWindow(usage.rate_limits?.seven_day, 7 * 24 * 60);
  if (!current && !weekly) return undefined;
  return {
    ...(current ? { current } : {}),
    ...(weekly ? { weekly } : {}),
  };
}

/**
 * Pull the primary five-hour claude.ai plan utilization reported by Claude Code.
 * The SDK API is experimental, so this parser deliberately accepts unknown input
 * and treats missing or changed fields as unavailable.
 */
export function extractClaudeSubscriptionUsedPercent(input: unknown): number | undefined {
  return extractClaudeSubscriptionUsage(input)?.current?.usedPercent;
}
