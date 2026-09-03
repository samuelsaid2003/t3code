import type { TurnId } from "@t3tools/contracts";

import type { TimelineEntry } from "../../session-logic";

export type TimelineSource = "slack" | "t3";
export type TimelineSourceFilter = "all" | TimelineSource;

export interface TimelineSourcePresentation {
  readonly entries: TimelineEntry[];
  readonly hiddenTurnCount: number;
  readonly latestSource: TimelineSource | null;
  readonly slackTurnCount: number;
  readonly t3TurnCount: number;
}

function entryTurnId(entry: TimelineEntry): TurnId | null {
  switch (entry.kind) {
    case "message":
      return entry.message.turnId;
    case "proposed-plan":
      return entry.proposedPlan.turnId;
    case "work":
      return entry.entry.turnId ?? null;
  }
}

function messageWasDeliveredToSlack(entry: Extract<TimelineEntry, { kind: "message" }>) {
  return entry.message.deliveryReceipts?.some((receipt) => receipt.channel === "slack") ?? false;
}

export function deriveTimelineSourcePresentation(
  entries: ReadonlyArray<TimelineEntry>,
  filter: TimelineSourceFilter,
): TimelineSourcePresentation {
  const slackTurnIds = new Set<TurnId>();
  for (const entry of entries) {
    if (
      entry.kind === "message" &&
      entry.message.role === "assistant" &&
      entry.message.turnId !== null &&
      messageWasDeliveredToSlack(entry)
    ) {
      slackTurnIds.add(entry.message.turnId);
    }
  }

  const sourceByEntryId = new Map<string, TimelineSource>();
  const sourceByTurnId = new Map<TurnId, TimelineSource>(
    [...slackTurnIds].map((turnId) => [turnId, "slack"] as const),
  );
  let currentSource: TimelineSource = "t3";
  let latestSource: TimelineSource | null = null;
  let slackTurnCount = 0;
  let t3TurnCount = 0;

  for (const entry of entries) {
    const turnId = entryTurnId(entry);
    if (entry.kind === "message" && entry.message.role === "user") {
      currentSource = entry.message.externalSource === "slack" ? "slack" : "t3";
      latestSource = currentSource;
      if (currentSource === "slack") {
        slackTurnCount += 1;
      } else {
        t3TurnCount += 1;
      }
      if (turnId !== null) sourceByTurnId.set(turnId, currentSource);
      sourceByEntryId.set(entry.id, currentSource);
      continue;
    }

    const directSlackSource =
      entry.kind === "message" &&
      (entry.message.externalSource === "slack" || messageWasDeliveredToSlack(entry));
    const source = directSlackSource
      ? "slack"
      : turnId === null
        ? currentSource
        : (sourceByTurnId.get(turnId) ?? currentSource);
    if (turnId !== null && !sourceByTurnId.has(turnId)) {
      sourceByTurnId.set(turnId, source);
    }
    sourceByEntryId.set(entry.id, source);
  }

  return {
    entries:
      filter === "all"
        ? [...entries]
        : entries.filter((entry) => sourceByEntryId.get(entry.id) === filter),
    hiddenTurnCount: filter === "slack" ? t3TurnCount : filter === "t3" ? slackTurnCount : 0,
    latestSource,
    slackTurnCount,
    t3TurnCount,
  };
}
