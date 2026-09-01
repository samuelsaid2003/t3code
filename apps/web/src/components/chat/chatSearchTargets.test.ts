import { EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { expandChatSearchTargets } from "./chatSearchTargets";

describe("expandChatSearchTargets", () => {
  it("addresses every occurrence while remaining compatible with older servers", () => {
    const base = {
      environmentId: EnvironmentId.make("environment-1"),
      projectId: ProjectId.make("project-1"),
      source: "assistant" as const,
      snippet: "industrial",
      messageCreatedAt: null,
    };
    const targets = expandChatSearchTargets([
      {
        ...base,
        threadId: ThreadId.make("thread-1"),
        messageId: MessageId.make("message-1"),
        matchCount: 3,
      },
      {
        ...base,
        threadId: ThreadId.make("thread-2"),
        messageId: MessageId.make("message-2"),
      },
    ]);

    expect(targets.map((target) => [target.match.messageId, target.occurrenceIndex])).toEqual([
      [MessageId.make("message-1"), 0],
      [MessageId.make("message-1"), 1],
      [MessageId.make("message-1"), 2],
      [MessageId.make("message-2"), 0],
    ]);
  });

  it("caps pathological histories", () => {
    const targets = expandChatSearchTargets(
      [
        {
          environmentId: EnvironmentId.make("environment-1"),
          threadId: ThreadId.make("thread-1"),
          projectId: ProjectId.make("project-1"),
          messageId: MessageId.make("message-1"),
          source: "user",
          snippet: "a",
          matchCount: 50,
          messageCreatedAt: null,
        },
      ],
      2,
    );

    expect(targets).toHaveLength(2);
  });
});
