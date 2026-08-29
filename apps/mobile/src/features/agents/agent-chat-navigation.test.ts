import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import {
  agentThreadShells,
  listModeForOpenedThread,
  mobileThreadShellKey,
  resolveAgentThreadForModeSwitch,
  standardThreadShells,
} from "./agent-chat-navigation";

function shell(
  id: string,
  kind: EnvironmentThreadShell["kind"],
  updatedAt: string,
  environmentId = "environment-a",
): EnvironmentThreadShell {
  return {
    environmentId: EnvironmentId.make(environmentId),
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-a"),
    kind,
    agentProfile: kind === "agent" ? { instructions: "Be useful" } : null,
    agentRoutines: [],
    agentRuns: [],
    title: id,
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-terra",
    },
    runtimeMode: "approval-required",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    linkedPullRequest: null,
    latestTurn: null,
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    titleRegeneration: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

describe("Agent Chat navigation", () => {
  it("keeps visual thread lists separate without changing the source collection", () => {
    const standard = shell("standard", "standard", "2026-08-29T01:00:00.000Z");
    const agent = shell("agent", "agent", "2026-08-29T02:00:00.000Z");
    const legacyRun = shell("legacy-run", "agent-run", "2026-08-29T03:00:00.000Z");
    const all = [standard, agent, legacyRun];

    expect(standardThreadShells(all)).toEqual([standard]);
    expect(agentThreadShells(all)).toEqual([agent]);
    expect(all).toHaveLength(3);
  });

  it("restores the saved Agent Chat and falls back to the most recently updated agent", () => {
    const older = shell("older", "agent", "2026-08-29T01:00:00.000Z");
    const newer = shell("newer", "agent", "2026-08-29T02:00:00.000Z");
    const all = [newer, older];

    expect(resolveAgentThreadForModeSwitch(all, mobileThreadShellKey(older))).toBe(older);
    expect(resolveAgentThreadForModeSwitch(all, "environment-a:missing")).toBe(newer);
  });

  it("selects Agents for Agent Chat deep links and Threads for every other thread kind", () => {
    expect(listModeForOpenedThread({ kind: "agent" })).toBe("agents");
    expect(listModeForOpenedThread({ kind: "standard" })).toBe("threads");
    expect(listModeForOpenedThread({ kind: "agent-run" })).toBe("threads");
    expect(listModeForOpenedThread({ kind: undefined })).toBe("threads");
  });
});
