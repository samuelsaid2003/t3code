import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import {
  sideNotchSelectionIndex,
  sideNotchSnapOffset,
  sideNotchThreadIndex,
  sideNotchThreads,
  sideNotchWheelThreads,
} from "./side-notch-navigation";

function shell(input: {
  readonly id: string;
  readonly kind?: "standard" | "agent" | "side";
  readonly updatedAt: string;
  readonly archivedAt?: string | null;
}): EnvironmentThreadShell {
  return {
    environmentId: EnvironmentId.make("environment-notch"),
    id: ThreadId.make(input.id),
    projectId: ProjectId.make("project-notch"),
    kind: input.kind ?? "standard",
    parentThreadId: null,
    agentProfile: null,
    agentRoutines: [],
    agentRuns: [],
    title: input.id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: input.updatedAt,
    archivedAt: input.archivedAt ?? null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

describe("side notch navigation", () => {
  it("keeps only active conversations from the selected mode in recency order", () => {
    const threads = [
      shell({ id: "standard-old", updatedAt: "2026-09-01T01:00:00.000Z" }),
      shell({ id: "agent-new", kind: "agent", updatedAt: "2026-09-01T04:00:00.000Z" }),
      shell({ id: "standard-new", updatedAt: "2026-09-01T03:00:00.000Z" }),
      shell({ id: "side", kind: "side", updatedAt: "2026-09-01T05:00:00.000Z" }),
      shell({
        id: "archived",
        updatedAt: "2026-09-01T06:00:00.000Z",
        archivedAt: "2026-09-01T07:00:00.000Z",
      }),
    ];

    expect(sideNotchThreads(threads, "threads").map((thread) => thread.id)).toEqual([
      "standard-new",
      "standard-old",
    ]);
    expect(sideNotchThreads(threads, "agents").map((thread) => thread.id)).toEqual(["agent-new"]);
  });

  it("selects the nearest wheel row and clamps at either end", () => {
    expect(sideNotchSelectionIndex({ currentIndex: 2, threadCount: 5, translationY: -21 })).toBe(2);
    expect(sideNotchSelectionIndex({ currentIndex: 2, threadCount: 5, translationY: -23 })).toBe(3);
    expect(sideNotchSelectionIndex({ currentIndex: 2, threadCount: 5, translationY: 88 })).toBe(0);
    expect(sideNotchSelectionIndex({ currentIndex: 4, threadCount: 5, translationY: -400 })).toBe(
      4,
    );
  });

  it("projects a short flick and snaps the selected row to center", () => {
    expect(
      sideNotchSelectionIndex({
        currentIndex: 2,
        threadCount: 5,
        translationY: -8,
        velocityY: -500,
      }),
    ).toBe(3);
    expect(sideNotchSnapOffset({ currentIndex: 2, selectedIndex: 4 })).toBe(-88);
  });

  it("limits the wheel to recent threads without dropping the open thread", () => {
    const threads = Array.from({ length: 5 }, (_, index) =>
      shell({
        id: `thread-${index}`,
        updatedAt: `2026-09-01T0${index}:00:00.000Z`,
      }),
    );

    expect(sideNotchWheelThreads(threads, threads[1]!, 3).map((thread) => thread.id)).toEqual([
      "thread-0",
      "thread-1",
      "thread-2",
    ]);
    expect(sideNotchWheelThreads(threads, threads[4]!, 3).map((thread) => thread.id)).toEqual([
      "thread-0",
      "thread-1",
      "thread-4",
    ]);
  });

  it("finds the current thread with its environment-scoped identity", () => {
    const first = shell({ id: "same", updatedAt: "2026-09-01T03:00:00.000Z" });
    const otherEnvironment = {
      ...first,
      environmentId: EnvironmentId.make("environment-other"),
    };
    expect(sideNotchThreadIndex([otherEnvironment, first], first)).toBe(1);
  });
});
