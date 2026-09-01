import { MessageId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import { deriveTimelineSourcePresentation } from "./slackTimelineFilter.logic";

function messageEntry(input: {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly source?: "slack";
  readonly deliveredToSlack?: boolean;
  readonly turnId: ReturnType<typeof TurnId.make> | null;
}): TimelineEntry {
  return {
    id: input.id,
    kind: "message",
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

function workEntry(id: string, turnId: ReturnType<typeof TurnId.make>): TimelineEntry {
  return {
    id,
    kind: "work",
    createdAt: "2026-09-01T00:00:00.000Z",
    entry: { id, createdAt: "2026-09-01T00:00:00.000Z", turnId, label: id, tone: "tool" },
  };
}

describe("deriveTimelineSourcePresentation", () => {
  it("keeps each Slack prompt, its work and delivered response together", () => {
    const t3TurnId = TurnId.make("turn-t3");
    const slackTurnId = TurnId.make("turn-slack");
    const entries = [
      messageEntry({ id: "t3-user", role: "user", turnId: null }),
      workEntry("t3-work", t3TurnId),
      messageEntry({ id: "t3-answer", role: "assistant", turnId: t3TurnId }),
      messageEntry({ id: "slack-user", role: "user", source: "slack", turnId: null }),
      workEntry("slack-work", slackTurnId),
      messageEntry({
        id: "slack-answer",
        role: "assistant",
        deliveredToSlack: true,
        turnId: slackTurnId,
      }),
    ];

    expect(
      deriveTimelineSourcePresentation(entries, "t3").entries.map((entry) => entry.id),
    ).toEqual(["t3-user", "t3-work", "t3-answer"]);
    expect(
      deriveTimelineSourcePresentation(entries, "slack").entries.map((entry) => entry.id),
    ).toEqual(["slack-user", "slack-work", "slack-answer"]);
  });

  it("uses a delivery receipt to classify a partially loaded Slack turn", () => {
    const slackTurnId = TurnId.make("turn-slack");
    const entries = [
      workEntry("slack-work", slackTurnId),
      messageEntry({
        id: "slack-answer",
        role: "assistant",
        deliveredToSlack: true,
        turnId: slackTurnId,
      }),
    ];

    expect(
      deriveTimelineSourcePresentation(entries, "slack").entries.map((entry) => entry.id),
    ).toEqual(["slack-work", "slack-answer"]);
  });

  it("reports loaded turn counts and the latest source", () => {
    const entries = [
      messageEntry({ id: "t3-user", role: "user", turnId: null }),
      messageEntry({ id: "slack-user", role: "user", source: "slack", turnId: null }),
    ];

    expect(deriveTimelineSourcePresentation(entries, "t3")).toMatchObject({
      hiddenTurnCount: 1,
      latestSource: "slack",
      slackTurnCount: 1,
      t3TurnCount: 1,
    });
  });
});
