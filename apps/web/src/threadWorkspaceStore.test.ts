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
  selectThreadWorkspaceGroups,
  shouldNavigateThreadWorkspaceRoute,
  threadWorkspaceRouteKey,
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

  it("parks an active split for an outside thread and restores it from either member", () => {
    const first = serverTarget("thread-1");
    const second = serverTarget("thread-2");
    const outside = serverTarget("thread-3");
    useThreadWorkspaceStore.getState().syncRouteTarget(first);
    useThreadWorkspaceStore.getState().addTarget(second, "bottom");
    useThreadWorkspaceStore.getState().setColumnRatio(63);
    useThreadWorkspaceStore.getState().setRowRatio(41);

    useThreadWorkspaceStore.getState().syncRouteTarget(outside);
    let state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(threadWorkspaceTargetKey(state.panes[0]!.target)).toBe(
      threadWorkspaceTargetKey(outside),
    );
    expect(selectThreadWorkspaceGroups(state)[0]?.panes.map((pane) => pane.target)).toEqual([
      first,
      second,
    ]);

    useThreadWorkspaceStore.getState().syncRouteTarget(first);
    state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(2);
    expect(state.layout).toBe("rows");
    expect(state.columnRatio).toBe(63);
    expect(state.rowRatio).toBe(41);
    expect(state.savedGroups).toHaveLength(1);
    expect(state.savedGroups[0]?.panes).toHaveLength(2);
    expect(state.activeGroupId).toBe(state.savedGroups[0]?.id);
    expect(
      threadWorkspaceTargetKey(state.panes.find((pane) => pane.id === state.focusedPaneId)!.target),
    ).toBe(threadWorkspaceTargetKey(first));
  });

  it("keeps parked groups while navigating between standalone threads", () => {
    const first = serverTarget("thread-1");
    const second = serverTarget("thread-2");
    useThreadWorkspaceStore.getState().syncRouteTarget(first);
    useThreadWorkspaceStore.getState().addTarget(second, "right");
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-3"));
    const savedGroups = useThreadWorkspaceStore.getState().savedGroups;

    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-4"));
    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.savedGroups).toBe(savedGroups);
  });

  it("shows and restores split groups received from another desktop window", () => {
    const first = serverTarget("thread-1");
    const second = serverTarget("thread-2");
    const outside = serverTarget("thread-3");
    useThreadWorkspaceStore.getState().syncRouteTarget(outside);

    useThreadWorkspaceStore.getState().syncSavedGroups([
      {
        id: "remote-group-1",
        panes: [
          { id: "remote-pane-1", target: first },
          { id: "remote-pane-2", target: second },
        ],
        layout: "columns",
        columnRatio: 58,
        rowRatio: 50,
      },
      {
        id: "remote-group-2",
        panes: [
          { id: "remote-pane-3", target: serverTarget("thread-4") },
          { id: "remote-pane-4", target: serverTarget("thread-5") },
        ],
        layout: "rows",
        columnRatio: 50,
        rowRatio: 44,
      },
    ]);

    let state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.activeGroupId).toBeNull();
    expect(selectThreadWorkspaceGroups(state)).toHaveLength(2);
    expect(selectThreadWorkspaceGroups(state)[0]?.panes.map((pane) => pane.target)).toEqual([
      first,
      second,
    ]);
    expect(
      state.savedGroups.every((group) =>
        group.panes.every((pane) => !pane.id.startsWith("remote-pane")),
      ),
    ).toBe(true);

    useThreadWorkspaceStore.getState().syncRouteTarget(second);
    state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(2);
    expect(state.columnRatio).toBe(58);
    expect(state.activeGroupId).toBe("remote-group-1");
  });

  it("updates one remotely synchronized group without replacing the others", () => {
    const firstGroup = {
      id: "remote-group-1",
      panes: [
        { id: "remote-pane-1", target: serverTarget("thread-1") },
        { id: "remote-pane-2", target: serverTarget("thread-2") },
      ],
      layout: "columns" as const,
      columnRatio: 50,
      rowRatio: 50,
    };
    const secondGroup = {
      id: "remote-group-2",
      panes: [
        { id: "remote-pane-3", target: serverTarget("thread-3") },
        { id: "remote-pane-4", target: serverTarget("thread-4") },
      ],
      layout: "rows" as const,
      columnRatio: 50,
      rowRatio: 50,
    };
    useThreadWorkspaceStore.getState().syncSavedGroups([firstGroup, secondGroup]);

    useThreadWorkspaceStore.getState().syncSavedGroup({ ...firstGroup, columnRatio: 64 });

    const state = useThreadWorkspaceStore.getState();
    expect(state.savedGroups).toHaveLength(2);
    expect(state.savedGroups.find((group) => group.id === firstGroup.id)?.columnRatio).toBe(64);
    expect(state.savedGroups.find((group) => group.id === secondGroup.id)?.rowRatio).toBe(50);
  });

  it("keeps an active window's local group layout when another window updates that group", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    const stateBefore = useThreadWorkspaceStore.getState();
    const activeGroup = stateBefore.savedGroups[0]!;

    useThreadWorkspaceStore.getState().syncSavedGroup({
      ...activeGroup,
      layout: "rows",
      columnRatio: 70,
      rowRatio: 35,
    });

    const state = useThreadWorkspaceStore.getState();
    expect(state.savedGroups[0]).toBe(activeGroup);
    expect(state.layout).toBe("columns");
    expect(state.columnRatio).toBe(50);
  });

  it("removes one remotely deleted parked group without disturbing an active group", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    const firstGroupId = useThreadWorkspaceStore.getState().activeGroupId!;
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-3"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-4"), "right");
    const secondGroupId = useThreadWorkspaceStore.getState().activeGroupId!;

    useThreadWorkspaceStore.getState().removeSavedGroup(firstGroupId);

    const state = useThreadWorkspaceStore.getState();
    expect(state.savedGroups.map((group) => group.id)).toEqual([secondGroupId]);
    expect(state.activeGroupId).toBe(secondGroupId);
    expect(state.panes).toHaveLength(2);
  });

  it("keeps multiple split groups and restores either group from any member", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-3"));

    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-4"), "right");
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-5"));

    let state = useThreadWorkspaceStore.getState();
    expect(state.savedGroups).toHaveLength(2);
    expect(
      state.savedGroups.map((group) =>
        group.panes.map((pane) => threadWorkspaceTargetKey(pane.target)),
      ),
    ).toEqual([
      [
        threadWorkspaceTargetKey(serverTarget("thread-1")),
        threadWorkspaceTargetKey(serverTarget("thread-2")),
      ],
      [
        threadWorkspaceTargetKey(serverTarget("thread-3")),
        threadWorkspaceTargetKey(serverTarget("thread-4")),
      ],
    ]);

    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-2"));
    state = useThreadWorkspaceStore.getState();
    expect(state.panes.map((pane) => threadWorkspaceTargetKey(pane.target))).toEqual([
      threadWorkspaceTargetKey(serverTarget("thread-1")),
      threadWorkspaceTargetKey(serverTarget("thread-2")),
    ]);

    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-4"));
    state = useThreadWorkspaceStore.getState();
    expect(state.panes.map((pane) => threadWorkspaceTargetKey(pane.target))).toEqual([
      threadWorkspaceTargetKey(serverTarget("thread-3")),
      threadWorkspaceTargetKey(serverTarget("thread-4")),
    ]);
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

  it("resynchronizes the concrete route when a draft becomes its canonical server thread", () => {
    const environmentId = "env-1" as EnvironmentId;
    const threadId = ThreadId.make("thread-promoted");
    const draftId = DraftId.make("draft-promoted");
    const projectRef = scopeProjectRef(environmentId, ProjectId.make("project-1"));
    const draftTarget = { kind: "draft", draftId } as const;
    const serverThreadTarget = {
      kind: "server",
      threadRef: scopeThreadRef(environmentId, threadId),
    } as const;
    useComposerDraftStore.getState().setProjectDraftThreadId(projectRef, draftId, { threadId });

    expect(threadWorkspaceTargetKey(draftTarget)).toBe(
      threadWorkspaceTargetKey(serverThreadTarget),
    );
    expect(threadWorkspaceRouteKey(draftTarget)).not.toBe(
      threadWorkspaceRouteKey(serverThreadTarget),
    );

    useThreadWorkspaceStore.getState().syncRouteTarget(draftTarget);
    useThreadWorkspaceStore.getState().syncRouteTarget(serverThreadTarget);
    useComposerDraftStore.getState().clearDraftThread(draftId);

    const [pane] = useThreadWorkspaceStore.getState().panes;
    expect(pane?.target).toEqual(serverThreadTarget);
    expect(threadWorkspaceTargetKey(pane!.target)).toBe(
      threadWorkspaceTargetKey(serverThreadTarget),
    );
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
    expect(state.savedGroups).toEqual([]);
    expect(state.activeGroupId).toBeNull();

    useThreadWorkspaceStore.getState().closePane(state.panes[0]!.id);
    expect(useThreadWorkspaceStore.getState().panes).toHaveLength(1);
  });

  it("dissolves only the active group and preserves other parked groups", () => {
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-1"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-2"), "right");
    useThreadWorkspaceStore.getState().syncRouteTarget(serverTarget("thread-3"));
    useThreadWorkspaceStore.getState().addTarget(serverTarget("thread-4"), "right");
    expect(useThreadWorkspaceStore.getState().savedGroups).toHaveLength(2);

    const activePaneId = useThreadWorkspaceStore.getState().focusedPaneId!;
    useThreadWorkspaceStore.getState().closePane(activePaneId);

    const state = useThreadWorkspaceStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.activeGroupId).toBeNull();
    expect(state.savedGroups).toHaveLength(1);
    expect(state.savedGroups[0]?.panes.map((pane) => pane.target)).toEqual([
      serverTarget("thread-1"),
      serverTarget("thread-2"),
    ]);
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
