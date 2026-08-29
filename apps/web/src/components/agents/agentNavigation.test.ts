import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveAgentIndexTarget } from "./agentNavigation";

const older = {
  environmentId: EnvironmentId.make("environment-1"),
  id: ThreadId.make("agent-older"),
  updatedAt: "2026-08-28T12:00:00.000Z",
};
const newer = {
  environmentId: EnvironmentId.make("environment-1"),
  id: ThreadId.make("agent-newer"),
  updatedAt: "2026-08-29T12:00:00.000Z",
};

describe("resolveAgentIndexTarget", () => {
  it("restores the last opened Agent Chat even when it is not the newest", () => {
    const lastAgentThreadKey = scopedThreadKey(scopeThreadRef(older.environmentId, older.id));

    expect(resolveAgentIndexTarget([newer, older], lastAgentThreadKey)).toBe(older);
  });

  it("falls back to the newest Agent Chat when the saved target is stale", () => {
    expect(resolveAgentIndexTarget([older, newer], "environment-1:missing")).toBe(newer);
  });

  it("returns null when there are no Agent Chats", () => {
    expect(resolveAgentIndexTarget([], null)).toBeNull();
  });
});
