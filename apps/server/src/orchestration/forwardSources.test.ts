import { describe, expect, it } from "vite-plus/test";
import { MessageId, ProjectId, ThreadId, type OrchestrationThread } from "@t3tools/contracts";

import { resolveForwardSourceFromThread } from "./forwardSources.ts";

const threadId = ThreadId.make("thread-1");
const finalId = MessageId.make("message-final");

function thread(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    kind: "standard",
    parentThreadId: null,
    agentProfile: null,
    agentRoutines: [],
    agentRuns: [],
    title: "Source thread",
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:03.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    titleRegeneration: null,
    deletedAt: null,
    messages: [
      {
        id: MessageId.make("message-interim"),
        role: "assistant",
        text: "interim",
        turnId: null,
        streaming: false,
        createdAt: "2026-09-01T00:00:01.000Z",
        updatedAt: "2026-09-01T00:00:01.000Z",
      },
      {
        id: finalId,
        role: "assistant",
        text: "  canonical final  ",
        turnId: null,
        streaming: false,
        createdAt: "2026-09-01T00:00:02.000Z",
        updatedAt: "2026-09-01T00:00:02.000Z",
      },
    ],
    proposedPlans: [],
    activities: [],
    checkpoints: [
      {
        turnId: null,
        checkpointTurnCount: 1,
        checkpointRef: null,
        status: "completed",
        files: [],
        assistantMessageId: finalId,
        completedAt: "2026-09-01T00:00:02.000Z",
      },
    ],
    session: null,
    ...overrides,
  } as OrchestrationThread;
}

describe("resolveForwardSourceFromThread", () => {
  it("resolves only canonical final assistant responses and trims visible markdown", () => {
    expect(
      resolveForwardSourceFromThread(thread(), { threadId, messageId: finalId }),
    ).toMatchObject({
      messageId: finalId,
      text: "canonical final",
      title: "Source thread",
    });
    expect(
      resolveForwardSourceFromThread(thread(), {
        threadId,
        messageId: MessageId.make("message-interim"),
      }),
    ).toBeNull();
  });

  it("rejects side and deleted threads", () => {
    expect(resolveForwardSourceFromThread(thread({ kind: "side" }), { threadId })).toBeNull();
    expect(
      resolveForwardSourceFromThread(thread({ deletedAt: "2026-09-01T00:00:04.000Z" }), {
        threadId,
      }),
    ).toBeNull();
  });
});
