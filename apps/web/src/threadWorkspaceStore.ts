import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { create } from "zustand";

import { useComposerDraftStore, type DraftId } from "./composerDraftStore";
import { isElectron } from "./env";
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
  savedGroup: ThreadWorkspaceGroupSnapshot | null;
  syncRouteTarget: (target: ThreadRouteTarget) => void;
  syncSavedGroup: (group: ThreadWorkspaceGroupSnapshot | null) => void;
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

// Unlike threadWorkspaceTargetKey, this key preserves the route's concrete
// representation. Draft promotion keeps one logical thread identity, but the
// pane still has to replace its draft target with the canonical server target.
export function threadWorkspaceRouteKey(target: ThreadRouteTarget): string {
  return target.kind === "server"
    ? `server:${scopedThreadKey(target.threadRef)}`
    : `draft:${target.draftId}`;
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
  savedGroup: null as ThreadWorkspaceGroupSnapshot | null,
};

const EMPTY_WORKSPACE_GROUP_PANES: readonly ThreadWorkspacePane[] = [];

export function selectThreadWorkspaceGroupPanes(
  state: Pick<ThreadWorkspaceState, "savedGroup">,
): readonly ThreadWorkspacePane[] {
  return state.savedGroup?.panes ?? EMPTY_WORKSPACE_GROUP_PANES;
}

export function selectThreadWorkspaceGroupActive(
  state: Pick<ThreadWorkspaceState, "panes" | "savedGroup">,
): boolean {
  if (state.panes.length <= 1 || state.savedGroup === null) return false;
  const activeKeys = new Set(state.panes.map((pane) => threadWorkspaceTargetKey(pane.target)));
  return (
    activeKeys.size === state.savedGroup.panes.length &&
    state.savedGroup.panes.every((pane) => activeKeys.has(threadWorkspaceTargetKey(pane.target)))
  );
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
  const panes = group.panes.map((pane) =>
    pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
  );
  return {
    panes,
    focusedPaneId: existing.id,
    layout: group.layout,
    columnRatio: group.columnRatio,
    rowRatio: group.rowRatio,
    maximizedPaneId: null,
    savedGroup: { ...group, panes },
  };
}

function localizeWorkspaceGroup(
  group: ThreadWorkspaceGroupSnapshot,
  current: ThreadWorkspaceGroupSnapshot | null,
): ThreadWorkspaceGroupSnapshot {
  return {
    ...group,
    panes: group.panes.map((pane) => {
      const existing = current ? findPaneByTarget(current.panes, pane.target) : null;
      return existing ? { ...existing, target: pane.target } : createPane(pane.target);
    }),
  };
}

export const useThreadWorkspaceStore = create<ThreadWorkspaceState>((set, get) => ({
  ...initialState,
  syncRouteTarget: (target) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      const panes = state.panes.map((pane) =>
        pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
      );
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroup:
          panes.length > 1 ? snapshotWorkspaceGroup({ ...state, panes }) : state.savedGroup,
      });
      return;
    }
    if (state.savedGroup) {
      const restored = restoredWorkspaceGroup(state.savedGroup, target);
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
        savedGroup: snapshotWorkspaceGroup(state),
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
      const panes = state.panes.map((pane) =>
        pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
      );
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroup:
          panes.length > 1 ? snapshotWorkspaceGroup({ ...state, panes }) : state.savedGroup,
      });
      return true;
    }
    if (state.savedGroup) {
      const restored = restoredWorkspaceGroup(state.savedGroup, target);
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
      savedGroup: snapshotWorkspaceGroup({
        panes,
        layout,
        columnRatio: state.columnRatio,
        rowRatio: state.rowRatio,
      }),
    });
    return true;
  },
  replacePaneTarget: (paneId, target) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      const panes = state.panes.map((pane) =>
        pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
      );
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroup:
          panes.length > 1 ? snapshotWorkspaceGroup({ ...state, panes }) : state.savedGroup,
      });
      return;
    }
    if (state.savedGroup) {
      const restored = restoredWorkspaceGroup(state.savedGroup, target);
      if (restored) {
        set(restored);
        return;
      }
    }
    if (!state.panes.some((pane) => pane.id === paneId)) return;
    const panes = state.panes.map((pane) => (pane.id === paneId ? { ...pane, target } : pane));
    set({
      panes,
      focusedPaneId: paneId,
      maximizedPaneId: null,
      savedGroup: panes.length > 1 ? snapshotWorkspaceGroup({ ...state, panes }) : state.savedGroup,
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
      savedGroup:
        panes.length > 1
          ? snapshotWorkspaceGroup({
              panes,
              layout: layoutAfterPaneCount(panes.length, state.layout),
              columnRatio: state.columnRatio,
              rowRatio: state.rowRatio,
            })
          : null,
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
    set({
      panes,
      focusedPaneId: sourcePaneId,
      maximizedPaneId: null,
      savedGroup: snapshotWorkspaceGroup({
        panes,
        layout: get().layout,
        columnRatio: get().columnRatio,
        rowRatio: get().rowRatio,
      }),
    });
  },
  movePaneToEnd: (paneId) => {
    const state = get();
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane || state.panes.at(-1)?.id === paneId) return;
    const panes = [...state.panes.filter((candidate) => candidate.id !== paneId), pane];
    set({
      panes,
      focusedPaneId: paneId,
      maximizedPaneId: null,
      savedGroup: snapshotWorkspaceGroup({ ...state, panes }),
    });
  },
  toggleMaximizedPane: (paneId) => {
    if (!get().panes.some((pane) => pane.id === paneId)) return;
    set((state) => ({
      focusedPaneId: paneId,
      maximizedPaneId: state.maximizedPaneId === paneId ? null : paneId,
    }));
  },
  setColumnRatio: (ratio) =>
    set((state) => {
      const columnRatio = clampThreadWorkspaceRatio(ratio);
      return {
        columnRatio,
        savedGroup:
          state.panes.length > 1
            ? snapshotWorkspaceGroup({ ...state, columnRatio })
            : state.savedGroup,
      };
    }),
  setRowRatio: (ratio) =>
    set((state) => {
      const rowRatio = clampThreadWorkspaceRatio(ratio);
      return {
        rowRatio,
        savedGroup:
          state.panes.length > 1
            ? snapshotWorkspaceGroup({ ...state, rowRatio })
            : state.savedGroup,
      };
    }),
  resetLayoutRatios: () =>
    set((state) => ({
      columnRatio: 50,
      rowRatio: 50,
      savedGroup:
        state.panes.length > 1
          ? snapshotWorkspaceGroup({ ...state, columnRatio: 50, rowRatio: 50 })
          : state.savedGroup,
    })),
  syncSavedGroup: (group) =>
    set((state) => ({
      savedGroup: group === null ? null : localizeWorkspaceGroup(group, state.savedGroup),
    })),
  reset: () => set({ ...initialState }),
}));

const THREAD_WORKSPACE_WINDOW_CHANNEL = "t3-thread-workspace-group-v1";

type ThreadWorkspaceWindowMessage =
  | { readonly sourceId: string; readonly type: "request-group" }
  | {
      readonly sourceId: string;
      readonly type: "sync-group";
      readonly group: ThreadWorkspaceGroupSnapshot | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isThreadRouteTarget(value: unknown): value is ThreadRouteTarget {
  if (!isRecord(value)) return false;
  if (value.kind === "draft") return typeof value.draftId === "string";
  if (value.kind !== "server" || !isRecord(value.threadRef)) return false;
  return (
    typeof value.threadRef.environmentId === "string" &&
    typeof value.threadRef.threadId === "string"
  );
}

function isWorkspaceGroupSnapshot(value: unknown): value is ThreadWorkspaceGroupSnapshot {
  if (!isRecord(value) || !Array.isArray(value.panes)) return false;
  if (value.panes.length < 2 || value.panes.length > THREAD_WORKSPACE_MAX_PANES) return false;
  if (value.layout !== "columns" && value.layout !== "rows" && value.layout !== "grid") {
    return false;
  }
  if (typeof value.columnRatio !== "number" || !Number.isFinite(value.columnRatio)) return false;
  if (typeof value.rowRatio !== "number" || !Number.isFinite(value.rowRatio)) return false;
  return value.panes.every(
    (pane) => isRecord(pane) && typeof pane.id === "string" && isThreadRouteTarget(pane.target),
  );
}

function workspaceGroupSignature(group: ThreadWorkspaceGroupSnapshot | null): string {
  if (group === null) return "none";
  return JSON.stringify({
    targets: group.panes.map((pane) => ({
      kind: pane.target.kind,
      key: threadWorkspaceTargetKey(pane.target),
    })),
    layout: group.layout,
    columnRatio: group.columnRatio,
    rowRatio: group.rowRatio,
  });
}

function startThreadWorkspaceWindowSync() {
  if (!isElectron || typeof BroadcastChannel === "undefined") return;

  const sourceId = `thread-workspace-window-${Math.random().toString(36).slice(2)}`;
  const channel = new BroadcastChannel(THREAD_WORKSPACE_WINDOW_CHANNEL);
  const sendWindowMessage = channel.postMessage.bind(channel);
  let latestSignature = workspaceGroupSignature(useThreadWorkspaceStore.getState().savedGroup);

  const postGroup = () => {
    sendWindowMessage({
      sourceId,
      type: "sync-group",
      group: useThreadWorkspaceStore.getState().savedGroup,
    } satisfies ThreadWorkspaceWindowMessage);
  };

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isRecord(event.data) || event.data.sourceId === sourceId) return;
    if (event.data.type === "request-group") {
      postGroup();
      return;
    }
    if (event.data.type !== "sync-group") return;
    const group = event.data.group;
    if (group !== null && !isWorkspaceGroupSnapshot(group)) return;
    latestSignature = workspaceGroupSignature(group);
    useThreadWorkspaceStore.getState().syncSavedGroup(group);
  });

  useThreadWorkspaceStore.subscribe((state, previous) => {
    if (state.savedGroup === previous.savedGroup) return;
    const signature = workspaceGroupSignature(state.savedGroup);
    if (signature === latestSignature) return;
    latestSignature = signature;
    postGroup();
  });

  sendWindowMessage({ sourceId, type: "request-group" } satisfies ThreadWorkspaceWindowMessage);
}

startThreadWorkspaceWindowSync();
