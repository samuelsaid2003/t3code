import { describe, expect, it } from "vite-plus/test";
import { MessageId, ProjectId, ThreadId } from "@t3tools/contracts";

import { compileForwardedResponses } from "./forwardResponses";

describe("compileForwardedResponses", () => {
  it("labels each source thread in one normal user message", () => {
    expect(
      compileForwardedResponses([
        {
          threadId: ThreadId.make("a"),
          projectId: ProjectId.make("p"),
          messageId: MessageId.make("m-a"),
          title: "Thread A",
          text: "First response",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          threadId: ThreadId.make("b"),
          projectId: ProjectId.make("p"),
          messageId: MessageId.make("m-b"),
          title: "Thread B",
          text: "Second response",
          updatedAt: "2026-09-01T00:00:01.000Z",
        },
      ]),
    ).toBe(
      "Forwarded responses\n\n## Thread A\n\nFirst response\n\n## Thread B\n\nSecond response",
    );
  });
});
