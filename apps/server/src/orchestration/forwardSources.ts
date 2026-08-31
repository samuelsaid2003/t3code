import type {
  OrchestrationForwardSource,
  OrchestrationForwardSourceInput,
  OrchestrationThread,
} from "@t3tools/contracts";

export function resolveForwardSourceFromThread(
  thread: OrchestrationThread,
  source: OrchestrationForwardSourceInput,
): OrchestrationForwardSource | null {
  if (
    thread.id !== source.threadId ||
    thread.kind === "side" ||
    thread.deletedAt !== null ||
    thread.archivedAt !== null
  ) {
    return null;
  }
  const canonicalMessageIds = new Set(
    thread.checkpoints.flatMap((checkpoint) =>
      checkpoint.assistantMessageId === null ? [] : [checkpoint.assistantMessageId],
    ),
  );
  if (thread.latestTurn?.assistantMessageId) {
    canonicalMessageIds.add(thread.latestTurn.assistantMessageId);
  }
  const message =
    source.messageId === undefined
      ? thread.messages.findLast(
          (candidate) =>
            candidate.role === "assistant" &&
            !candidate.streaming &&
            candidate.text.trim().length > 0 &&
            canonicalMessageIds.has(candidate.id),
        )
      : thread.messages.find(
          (candidate) =>
            candidate.id === source.messageId &&
            candidate.role === "assistant" &&
            !candidate.streaming &&
            candidate.text.trim().length > 0 &&
            canonicalMessageIds.has(candidate.id),
        );
  return message === undefined
    ? null
    : {
        threadId: thread.id,
        projectId: thread.projectId,
        messageId: message.id,
        title: thread.title,
        text: message.text.trim(),
        updatedAt: message.updatedAt,
      };
}
