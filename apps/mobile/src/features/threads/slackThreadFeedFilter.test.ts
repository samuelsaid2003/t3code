import { MessageId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ThreadFeedEntry } from "../../lib/threadActivity";
import { deriveThreadFeedSourcePresentation } from "./slackThreadFeedFilter";

function messageEntry(input: {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly source?: "slack";
  readonly deliveredToSlack?: boolean;
  readonly turnId: ReturnType<typeof TurnId.make> | null;
}): ThreadFeedEntry {
  return {
    id: input.id,
    type: "message",
    createdAt: "2026-09-01T00:00:00.000Z",
    message: {
      id: MessageId.make(input.id),
      role: input.role,
      text: input.id,
      turnId: input.turnId,
      streaming: false,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      ...(input.source ? { externalSource: input.source } : {}),
      ...(input.deliveredToSlack
        ? {
            deliveryReceipts: [
              { channel: "slack" as const, deliveredAt: "2026-09-01T00:00:01.000Z" },
            ],
          }
        : {}),
    },
  };
}

function activityEntry(id: string, turnId: ReturnType<typeof TurnId.make>): ThreadFeedEntry {
  return {
    id,
    type: "activity-group",
    createdAt: "2026-09-01T00:00:00.000Z",
    turnId,
    activities: [],
  };
}

describe("deriveThreadFeedSourcePresentation", () => {
  it("keeps each Slack prompt, its work and delivered response together", () => {
    const t3TurnId = TurnId.make("turn-t3");
    const slackTurnId = TurnId.make("turn-slack");
    const feed = [
      messageEntry({ id: "t3-user", role: "user", turnId: null }),
      activityEntry("t3-work", t3TurnId),
      messageEntry({ id: "t3-answer", role: "assistant", turnId: t3TurnId }),
      messageEntry({ id: "slack-user", role: "user", source: "slack", turnId: null }),
      activityEntry("slack-work", slackTurnId),
      messageEntry({
        id: "slack-answer",
        role: "assistant",
        deliveredToSlack: true,
        turnId: slackTurnId,
      }),
    ];

    expect(deriveThreadFeedSourcePresentation(feed, "t3").feed.map((entry) => entry.id)).toEqual([
      "t3-user",
      "t3-work",
      "t3-answer",
    ]);
    expect(deriveThreadFeedSourcePresentation(feed, "slack").feed.map((entry) => entry.id)).toEqual(
      ["slack-user", "slack-work", "slack-answer"],
    );
  });

  it("uses a delivery receipt to classify a partially loaded Slack turn", () => {
    const slackTurnId = TurnId.make("turn-slack");
    const feed = [
      activityEntry("slack-work", slackTurnId),
      messageEntry({
        id: "slack-answer",
        role: "assistant",
        deliveredToSlack: true,
        turnId: slackTurnId,
      }),
    ];

    expect(deriveThreadFeedSourcePresentation(feed, "slack").feed.map((entry) => entry.id)).toEqual(
      ["slack-work", "slack-answer"],
    );
  });

  it("reports loaded turn counts and the latest source", () => {
    const feed = [
      messageEntry({ id: "t3-user", role: "user", turnId: null }),
      messageEntry({ id: "slack-user", role: "user", source: "slack", turnId: null }),
    ];

    expect(deriveThreadFeedSourcePresentation(feed, "t3")).toMatchObject({
      hiddenTurnCount: 1,
      latestSource: "slack",
      slackTurnCount: 1,
      t3TurnCount: 1,
    });
  });
});
