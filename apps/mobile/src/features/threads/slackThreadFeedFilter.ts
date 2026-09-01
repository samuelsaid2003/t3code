import type { TurnId } from "@t3tools/contracts";

import type { ThreadFeedEntry } from "../../lib/threadActivity";

export type ThreadFeedSource = "slack" | "t3";
export type ThreadFeedSourceFilter = "all" | ThreadFeedSource;

export interface ThreadFeedSourcePresentation {
  readonly feed: ThreadFeedEntry[];
  readonly hiddenTurnCount: number;
  readonly latestSource: ThreadFeedSource | null;
  readonly slackTurnCount: number;
  readonly t3TurnCount: number;
}

function entryTurnId(entry: ThreadFeedEntry): TurnId | null {
  return entry.type === "message" ? entry.message.turnId : entry.turnId;
}

function messageWasDeliveredToSlack(entry: Extract<ThreadFeedEntry, { type: "message" }>) {
  return entry.message.deliveryReceipts?.some((receipt) => receipt.channel === "slack") ?? false;
}

export function deriveThreadFeedSourcePresentation(
  feed: ReadonlyArray<ThreadFeedEntry>,
  filter: ThreadFeedSourceFilter,
): ThreadFeedSourcePresentation {
  const slackTurnIds = new Set<TurnId>();
  for (const entry of feed) {
    if (
      entry.type === "message" &&
      entry.message.role === "assistant" &&
      entry.message.turnId !== null &&
      messageWasDeliveredToSlack(entry)
    ) {
      slackTurnIds.add(entry.message.turnId);
    }
  }

  const sourceByEntryId = new Map<string, ThreadFeedSource>();
  const sourceByTurnId = new Map<TurnId, ThreadFeedSource>(
    [...slackTurnIds].map((turnId) => [turnId, "slack"] as const),
  );
  let currentSource: ThreadFeedSource = "t3";
  let latestSource: ThreadFeedSource | null = null;
  let slackTurnCount = 0;
  let t3TurnCount = 0;

  for (const entry of feed) {
    const turnId = entryTurnId(entry);
    if (entry.type === "message" && entry.message.role === "user") {
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
      entry.type === "message" &&
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
    feed:
      filter === "all"
        ? [...feed]
        : feed.filter((entry) => sourceByEntryId.get(entry.id) === filter),
    hiddenTurnCount: filter === "slack" ? t3TurnCount : filter === "t3" ? slackTurnCount : 0,
    latestSource,
    slackTurnCount,
    t3TurnCount,
  };
}
