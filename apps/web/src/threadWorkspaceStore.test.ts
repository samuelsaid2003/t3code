import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { ThreadRouteTarget } from "./threadRoutes";
import { DraftId, useComposerDraftStore } from "./composerDraftStore";
import {
  handleWorkspaceDragEnd,
  workspaceCollisionDetection,
} from "./components/thread-workspace/ThreadWorkspaceDndProvider";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  clampThreadWorkspaceRatio,
  shouldNavigateThreadWorkspaceRoute,
  threadWorkspaceTargetKey,
  useThreadWorkspaceStore,
} from "./threadWorkspaceStore";

function serverTarget(id: string): ThreadRouteTarget {
  return {
    kind: "server",
    threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
  };
}

beforeEach(() => {
  useThreadWorkspaceStore.getState().reset();
});

describe("threadWorkspaceStore", () => {
  it("does not navigate back to a stale pane while a route sync is pending", () => {
    expect(
      shouldNavigateThreadWorkspaceRoute({
        focusedTargetKey: "draft:draft-1",
        routeTargetKey: "server:env-1:thread-1",
        pendingRouteTargetKey: "server:env-1:thread-1",
      }),
    ).toBe(false);
    expect(
      shouldNavigateThreadWorkspaceRoute({
        focusedTargetKey: "server:env-1:thread-2",
        routeTargetKey: "server:env-1:thread-1",
        pendingRouteTargetKey: null,
      }),
    ).toBe(true);
  });

  it("seeds one routed thread and replaces the focused pane on route navigation", () => {
    const first = serverTarget("thread-1");
    const second = serverTarget("thread-2");
    useThreadWorkspaceStore.getState().syncRouteTarget(first);
    useThreadWorkspaceStore.getState().syncRouteTarget(second);

    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(threadWorkspaceTargetKey(state.panes[0]!.target)).toBe(threadWorkspaceTargetKey(second));
    expect(state.layout).toBe("single");
  });

  it("creates directional two-pane layouts and promotes three panes to a grid", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    expect(useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "bottom")).toBe(
      true,
    );
    expect(useThreadWorkspaceStore.getState().layout).toBe("rows");

    expect(useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-3"), "right")).toBe(
      true,
    );
    expect(useThreadWorkspaceStore.getState().layout).toBe("grid");
  });

  it("focuses an existing target instead of duplicating it", () => {
    const first = serverTarget("thread-1");
    useThreadWorkspaceStore.getState().syncRouteTarget(first);
    const firstPaneId = useThreadWorkspaceStore.getState().focusedPaneId;
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    useThreadWorkspaceStore.getState().addTarget(first, "left");

    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(2);
    expect(state.focusedPaneId).toBe(firstPaneId);
  });

  it("promotes a draft pane instead of mounting the same underlying thread twice", () => {
    const environmentId = "env-1" as EnvironmentId;
    const threadId = ThreadId.make("thread-promoted");
    const draftId = DraftId.make("draft-promoted");
    const projectRef = scopeProjectRef(environmentId, ProjectId.make("project-1"));
    useComposerDraftStore.getState().setProjectDraftThreadId(projectRef, draftId, { threadId });

    useThreadWorkspaceStore.getState().syncRouteTarget({ kind: "draft", draftId });
    useThreadWorkspaceStore
      .getState()
      .addTarget({ kind: "server", threadRef: scopeThreadRef(environmentId, threadId) }, "right");

    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0]?.target.kind).toBe("server");
    useComposerDraftStore.getState().clearDraftThread(draftId);
  });

  it("does not turn a pinned reorder into a workspace split", () => {
    const first = serverTarget("thread-1");
    const second = serverTarget("thread-2");
    useThreadWorkspaceStore.getState().syncRouteTarget(first);

    handleWorkspaceDragEnd({
      active: {
        data: {
          current: { type: "workspace-thread", target: first, pinnedSortable: true },
        },
      },
      over: {
        data: {
          current: { type: "workspace-thread", target: second, pinnedSortable: true },
        },
      },
    } as unknown as DragEndEvent);

    expect(useThreadWorkspaceStore.getState().panes).toHaveLength(1);
  });

  it("does not choose a distant pane when a thread is dropped on nothing", () => {
    const target = serverTarget("thread-1");
    const collisions = workspaceCollisionDetection({
      active: {
        data: { current: { type: "workspace-thread", target } },
      },
      droppableContainers: [
        {
          id: "pane",
          data: { current: { type: "workspace-pane-target", paneId: "pane-1" } },
        },
      ],
      droppableRects: new Map([
        ["pane", { top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100 }],
      ]),
      pointerCoordinates: { x: 500, y: 500 },
    } as unknown as Parameters<typeof workspaceCollisionDetection>[0]);

    expect(collisions).toEqual([]);
  });

  it("caps the workspace at four panes without replacing an existing pane", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    for (const id of ["thread-2", "thread-3", "thread-4"]) {
      expect(useThreadWorkspaceStore.getState().addTarget(serverTarget(id), "right")).toBe(true);
    }
    expect(useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-5"), "right")).toBe(
      false,
    );
    expect(useThreadWorkspaceStore.getState().panes).toHaveLength(4);
  });

  it("closes only the view, keeps one pane, and selects an adjacent pane", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    const secondPaneId = useThreadWorkspaceStore.getState().focusedPaneId!;
    useThreadWorkspaceStore.getState().closePane(secondPaneId);

    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.focusedPaneId).toBe(state.panes[0]!.id);
    expect(state.layout).toBe("single");

    useThreadWorkspaceStore.getState().closePane(state.panes[0]!.id);
    expect(useThreadWorkspaceStore.getState().panes).toHaveLength(1);
  });

  it("swaps pane slots and toggles temporary maximization", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    const [first, second] = useThreadWorkspaceStore.getState().panes;
    useThreadWorkspaceStore.getState().swapPanes(first!.id, second!.id);
    expect(useThreadWorkspaceStore.getState().panes.map((pane) => pane.id)).toEqual([
      second!.id,
      first!.id,
    ]);

    useThreadWorkspaceStore.getState().toggleMaximizedPane(first!.id);
    expect(useThreadWorkspaceStore.getState().maximizedPaneId).toBe(first!.id);
    useThreadWorkspaceStore.getState().toggleMaximizedPane(first!.id);
    expect(useThreadWorkspaceStore.getState().maximizedPaneId).toBeNull();
  });

  it("moves a pane into the empty grid slot", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-3"), "right");
    const firstPaneId = useThreadWorkspaceStore.getState().panes[0]!.id;
    useThreadWorkspaceStore.getState().movePaneToEnd(firstPaneId);
    expect(useThreadWorkspaceStore.getState().panes.at(-1)?.id).toBe(firstPaneId);
  });

  it("clamps and resets shared resize ratios", () => {
    expect(clampThreadWorkspaceRatio(5)).toBe(25);
    expect(clampThreadWorkspaceRatio(95)).toBe(75);
    useThreadWorkspaceStore.getState().setColumnRatio(10);
    useThreadWorkspaceStore.getState().setRowRatio(90);
    expect(useThreadWorkspaceStore.getState()).toMatchObject({ columnRatio: 25, rowRatio: 75 });
    useThreadWorkspaceStore.getState().resetLayoutRatios();
    expect(useThreadWorkspaceStore.getState()).toMatchObject({ columnRatio: 50, rowRatio: 50 });
  });
});
