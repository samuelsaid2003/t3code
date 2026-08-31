import type { MessageId, OrchestrationEvent } from "@t3tools/contracts";

import type { ThreadTracker } from "./threadTracker.ts";

export interface ProactiveSlackDelivery {
  readonly id: string;
  readonly text: string;
  readonly messageId?: MessageId;
}

export function resolveProactiveSlackDelivery(
  event: OrchestrationEvent | null,
  tracker: Pick<ThreadTracker, "routineResponseDetails">,
): ProactiveSlackDelivery | null {
  if (event?.type === "thread.agent-run-completed") {
    const response = tracker.routineResponseDetails(event);
    return {
      id: `completed:${event.payload.runId}`,
      text: response.text,
      ...(response.messageId === undefined ? {} : { messageId: response.messageId }),
    };
  }
  if (event?.type === "thread.agent-run-attention-requested") {
    return {
      id: `attention:${event.payload.runId}`,
      text: `Scheduled routine needs attention: ${event.payload.summary}`,
    };
  }
  return null;
}
