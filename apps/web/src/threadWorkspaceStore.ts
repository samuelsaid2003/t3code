import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { create } from "zustand";

import { useComposerDraftStore, type DraftId } from "./composerDraftStore";
import type { ThreadRouteTarget } from "./threadRoutes";

export const THREAD_WORKSPACE_MAX_PANES = 4;
export const THREAD_WORKSPACE_MIN_RATIO = 25;
export const THREAD_WORKSPACE_MAX_RATIO = 75;

export type ThreadWorkspaceLayout = "single" | "columns" | "rows" | "grid";
export type ThreadWorkspaceDropRegion = "left" | "right" | "top" | "bottom";

export interface ThreadWorkspacePane {
  readonly id: string;
  readonly target: ThreadRouteTarget;
}

export interface ThreadWorkspaceGroupSnapshot {
  readonly panes: ThreadWorkspacePane[];
  readonly layout: ThreadWorkspaceLayout;
  readonly columnRatio: number;
  readonly rowRatio: number;
}

export interface ThreadWorkspaceState {
  panes: ThreadWorkspacePane[];
  focusedPaneId: string | null;
  layout: ThreadWorkspaceLayout;
  columnRatio: number;
  rowRatio: number;
  maximizedPaneId: string | null;
  parkedGroup: ThreadWorkspaceGroupSnapshot | null;
  syncRouteTarget: (target: ThreadRouteTarget) => void;
  addTarget: (target: ThreadRouteTarget, region: ThreadWorkspaceDropRegion) => boolean;
  replacePaneTarget: (paneId: string, target: ThreadRouteTarget) => void;
  focusPane: (paneId: string) => void;
  closePane: (paneId: string) => void;
  swapPanes: (sourcePaneId: string, targetPaneId: string) => void;
  movePaneToEnd: (paneId: string) => void;
  toggleMaximizedPane: (paneId: string) => void;
  setColumnRatio: (ratio: number) => void;
  setRowRatio: (ratio: number) => void;
  resetLayoutRatios: () => void;
  reset: () => void;
}

let nextPaneId = 1;

function createPane(target: ThreadRouteTarget): ThreadWorkspacePane {
  return { id: `thread-pane-${nextPaneId++}`, target };
}

function resolveDraftThreadIdentity(draftId: DraftId) {
  const session = useComposerDraftStore.getState().getDraftSession(draftId);
  return session ? scopeThreadRef(session.environmentId, session.threadId) : null;
}

export function threadWorkspaceTargetKey(target: ThreadRouteTarget): string {
  if (target.kind === "server") {
    return `server:${scopedThreadKey(target.threadRef)}`;
  }
  const threadRef = resolveDraftThreadIdentity(target.draftId);
  return threadRef ? `server:${scopedThreadKey(threadRef)}` : `draft:${target.draftId}`;
}

export function shouldNavigateThreadWorkspaceRoute(input: {
  readonly focusedTargetKey: string | null;
  readonly routeTargetKey: string;
  readonly pendingRouteTargetKey: string | null;
}): boolean {
  return (
    input.focusedTargetKey !== null &&
    input.focusedTargetKey !== input.routeTargetKey &&
    input.pendingRouteTargetKey !== input.routeTargetKey
  );
}

function findPaneByTarget(
  panes: ReadonlyArray<ThreadWorkspacePane>,
  target: ThreadRouteTarget,
): ThreadWorkspacePane | null {
  const targetKey = threadWorkspaceTargetKey(target);
  return panes.find((pane) => threadWorkspaceTargetKey(pane.target) === targetKey) ?? null;
}

function promoteExistingPaneTarget(
  pane: ThreadWorkspacePane,
  target: ThreadRouteTarget,
): ThreadWorkspacePane {
  return pane.target.kind === "draft" && target.kind === "server" ? { ...pane, target } : pane;
}

function layoutAfterPaneCount(
  paneCount: number,
  current: ThreadWorkspaceLayout,
): ThreadWorkspaceLayout {
  if (paneCount <= 1) return "single";
  if (paneCount === 2) return current === "rows" ? "rows" : "columns";
  return "grid";
}

export function clampThreadWorkspaceRatio(ratio: number): number {
  return Math.min(THREAD_WORKSPACE_MAX_RATIO, Math.max(THREAD_WORKSPACE_MIN_RATIO, ratio));
}

const initialState = {
  panes: [] as ThreadWorkspacePane[],
  focusedPaneId: null as string | null,
  layout: "single" as ThreadWorkspaceLayout,
  columnRatio: 50,
  rowRatio: 50,
  maximizedPaneId: null as string | null,
  parkedGroup: null as ThreadWorkspaceGroupSnapshot | null,
};

const EMPTY_WORKSPACE_GROUP_PANES: readonly ThreadWorkspacePane[] = [];

export function selectThreadWorkspaceGroupPanes(
  state: Pick<ThreadWorkspaceState, "panes" | "parkedGroup">,
): readonly ThreadWorkspacePane[] {
  if (state.panes.length > 1) return state.panes;
  return state.parkedGroup?.panes ?? EMPTY_WORKSPACE_GROUP_PANES;
}

function snapshotWorkspaceGroup(
  state: Pick<ThreadWorkspaceState, "panes" | "layout" | "columnRatio" | "rowRatio">,
): ThreadWorkspaceGroupSnapshot {
  return {
    panes: state.panes,
    layout: state.layout,
    columnRatio: state.columnRatio,
    rowRatio: state.rowRatio,
  };
}

function restoredWorkspaceGroup(group: ThreadWorkspaceGroupSnapshot, target: ThreadRouteTarget) {
  const existing = findPaneByTarget(group.panes, target);
  if (!existing) return null;
  return {
    panes: group.panes.map((pane) =>
      pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
    ),
    focusedPaneId: existing.id,
    layout: group.layout,
    columnRatio: group.columnRatio,
    rowRatio: group.rowRatio,
    maximizedPaneId: null,
    parkedGroup: null,
  };
}

export const useThreadWorkspaceStore = create<ThreadWorkspaceState>((set, get) => ({
  ...initialState,
  syncRouteTarget: (target) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      set({
        panes: state.panes.map((pane) =>
          pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
        ),
        focusedPaneId: existing.id,
        maximizedPaneId: null,
      });
      return;
    }
    if (state.parkedGroup) {
      const restored = restoredWorkspaceGroup(state.parkedGroup, target);
      if (restored) {
        set(restored);
        return;
      }
    }
    if (state.panes.length === 0 || state.focusedPaneId === null) {
      const pane = createPane(target);
      set({ panes: [pane], focusedPaneId: pane.id, layout: "single" });
      return;
    }
    if (state.panes.length > 1) {
      const pane = createPane(target);
      set({
        panes: [pane],
        focusedPaneId: pane.id,
        layout: "single",
        maximizedPaneId: null,
        parkedGroup: snapshotWorkspaceGroup(state),
      });
      return;
    }
    set({
      panes: state.panes.map((pane) =>
        pane.id === state.focusedPaneId ? { ...pane, target } : pane,
      ),
      maximizedPaneId: null,
    });
  },
  addTarget: (target, region) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      set({
        panes: state.panes.map((pane) =>
          pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
        ),
        focusedPaneId: existing.id,
        maximizedPaneId: null,
      });
      return true;
    }
    if (state.parkedGroup) {
      const restored = restoredWorkspaceGroup(state.parkedGroup, target);
      if (restored) {
        set(restored);
        return true;
      }
    }
    if (state.panes.length === 0) {
      const pane = createPane(target);
      set({ panes: [pane], focusedPaneId: pane.id, layout: "single" });
      return true;
    }
    if (state.panes.length >= THREAD_WORKSPACE_MAX_PANES) return false;

    const pane = createPane(target);
    const prepend = region === "left" || region === "top";
    const panes = prepend ? [pane, ...state.panes] : [...state.panes, pane];
    const layout: ThreadWorkspaceLayout =
      state.panes.length === 1
        ? region === "top" || region === "bottom"
          ? "rows"
          : "columns"
        : "grid";
    set({
      panes,
      focusedPaneId: pane.id,
      layout,
      maximizedPaneId: null,
      parkedGroup: null,
    });
    return true;
  },
  replacePaneTarget: (paneId, target) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      set({
        panes: state.panes.map((pane) =>
          pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
        ),
        focusedPaneId: existing.id,
        maximizedPaneId: null,
      });
      return;
    }
    if (state.parkedGroup) {
      const restored = restoredWorkspaceGroup(state.parkedGroup, target);
      if (restored) {
        set(restored);
        return;
      }
    }
    if (!state.panes.some((pane) => pane.id === paneId)) return;
    set({
      panes: state.panes.map((pane) => (pane.id === paneId ? { ...pane, target } : pane)),
      focusedPaneId: paneId,
      maximizedPaneId: null,
    });
  },
  focusPane: (paneId) => {
    if (!get().panes.some((pane) => pane.id === paneId)) return;
    set({ focusedPaneId: paneId });
  },
  closePane: (paneId) => {
    const state = get();
    if (state.panes.length <= 1) return;
    const index = state.panes.findIndex((pane) => pane.id === paneId);
    if (index === -1) return;
    const panes = state.panes.filter((pane) => pane.id !== paneId);
    const nextFocusedPaneId =
      state.focusedPaneId === paneId
        ? (panes[Math.min(index, panes.length - 1)]?.id ?? null)
        : state.focusedPaneId;
    set({
      panes,
      focusedPaneId: nextFocusedPaneId,
      layout: layoutAfterPaneCount(panes.length, state.layout),
      maximizedPaneId: state.maximizedPaneId === paneId ? null : state.maximizedPaneId,
      parkedGroup: null,
    });
  },
  swapPanes: (sourcePaneId, targetPaneId) => {
    if (sourcePaneId === targetPaneId) return;
    const panes = [...get().panes];
    const sourceIndex = panes.findIndex((pane) => pane.id === sourcePaneId);
    const targetIndex = panes.findIndex((pane) => pane.id === targetPaneId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const sourcePane = panes[sourceIndex]!;
    panes[sourceIndex] = panes[targetIndex]!;
    panes[targetIndex] = sourcePane;
    set({ panes, focusedPaneId: sourcePaneId, maximizedPaneId: null });
  },
  movePaneToEnd: (paneId) => {
    const state = get();
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane || state.panes.at(-1)?.id === paneId) return;
    set({
      panes: [...state.panes.filter((candidate) => candidate.id !== paneId), pane],
      focusedPaneId: paneId,
      maximizedPaneId: null,
    });
  },
  toggleMaximizedPane: (paneId) => {
    if (!get().panes.some((pane) => pane.id === paneId)) return;
    set((state) => ({
      focusedPaneId: paneId,
      maximizedPaneId: state.maximizedPaneId === paneId ? null : paneId,
    }));
  },
  setColumnRatio: (ratio) => set({ columnRatio: clampThreadWorkspaceRatio(ratio) }),
  setRowRatio: (ratio) => set({ rowRatio: clampThreadWorkspaceRatio(ratio) }),
  resetLayoutRatios: () => set({ columnRatio: 50, rowRatio: 50 }),
  reset: () => set({ ...initialState }),
}));
