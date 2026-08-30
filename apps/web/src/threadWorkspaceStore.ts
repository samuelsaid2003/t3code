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
  readonly id: string;
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
  savedGroups: ThreadWorkspaceGroupSnapshot[];
  activeGroupId: string | null;
  syncRouteTarget: (target: ThreadRouteTarget) => void;
  syncSavedGroups: (groups: ThreadWorkspaceGroupSnapshot[]) => void;
  syncSavedGroup: (group: ThreadWorkspaceGroupSnapshot) => void;
  removeSavedGroup: (groupId: string) => void;
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
let nextGroupId = 1;
const workspaceGroupIdPrefix = Math.random().toString(36).slice(2);

function createPane(target: ThreadRouteTarget): ThreadWorkspacePane {
  return { id: `thread-pane-${nextPaneId++}`, target };
}

function createGroupId(): string {
  return `thread-group-${workspaceGroupIdPrefix}-${nextGroupId++}`;
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
  savedGroups: [] as ThreadWorkspaceGroupSnapshot[],
  activeGroupId: null as string | null,
};

export function selectThreadWorkspaceGroups(
  state: Pick<ThreadWorkspaceState, "savedGroups">,
): readonly ThreadWorkspaceGroupSnapshot[] {
  return state.savedGroups;
}

function snapshotWorkspaceGroup(
  state: Pick<ThreadWorkspaceState, "panes" | "layout" | "columnRatio" | "rowRatio">,
  groupId: string,
): ThreadWorkspaceGroupSnapshot {
  return {
    id: groupId,
    panes: state.panes,
    layout: state.layout,
    columnRatio: state.columnRatio,
    rowRatio: state.rowRatio,
  };
}

function restoredWorkspaceGroup(
  group: ThreadWorkspaceGroupSnapshot,
  target: ThreadRouteTarget,
  savedGroups: ReadonlyArray<ThreadWorkspaceGroupSnapshot>,
) {
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
    activeGroupId: group.id,
    savedGroups: upsertWorkspaceGroup(savedGroups, { ...group, panes }),
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

function findGroupByTarget(
  groups: ReadonlyArray<ThreadWorkspaceGroupSnapshot>,
  target: ThreadRouteTarget,
): ThreadWorkspaceGroupSnapshot | null {
  return groups.find((group) => findPaneByTarget(group.panes, target) !== null) ?? null;
}

function removeWorkspaceGroup(
  groups: ReadonlyArray<ThreadWorkspaceGroupSnapshot>,
  groupId: string,
): ThreadWorkspaceGroupSnapshot[] {
  return groups.filter((group) => group.id !== groupId);
}

function upsertWorkspaceGroup(
  groups: ReadonlyArray<ThreadWorkspaceGroupSnapshot>,
  group: ThreadWorkspaceGroupSnapshot,
): ThreadWorkspaceGroupSnapshot[] {
  const existingIndex = groups.findIndex((candidate) => candidate.id === group.id);
  if (
    existingIndex !== -1 &&
    workspaceGroupSignature(groups[existingIndex]!) === workspaceGroupSignature(group)
  ) {
    return groups as ThreadWorkspaceGroupSnapshot[];
  }
  if (existingIndex === -1) {
    return [...groups, group];
  }
  const next = [...groups];
  next[existingIndex] = group;
  return next;
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
      const savedGroups =
        panes.length > 1 && state.activeGroupId !== null
          ? upsertWorkspaceGroup(
              state.savedGroups,
              snapshotWorkspaceGroup({ ...state, panes }, state.activeGroupId),
            )
          : state.savedGroups;
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroups,
      });
      return;
    }
    const savedGroup = findGroupByTarget(state.savedGroups, target);
    if (savedGroup) {
      const restored = restoredWorkspaceGroup(savedGroup, target, state.savedGroups);
      if (restored) {
        set(restored);
        return;
      }
    }
    if (state.panes.length === 0 || state.focusedPaneId === null) {
      const pane = createPane(target);
      set({
        panes: [pane],
        focusedPaneId: pane.id,
        layout: "single",
        activeGroupId: null,
      });
      return;
    }
    if (state.panes.length > 1) {
      const groupId = state.activeGroupId ?? createGroupId();
      const pane = createPane(target);
      set({
        panes: [pane],
        focusedPaneId: pane.id,
        layout: "single",
        maximizedPaneId: null,
        savedGroups: upsertWorkspaceGroup(
          state.savedGroups,
          snapshotWorkspaceGroup(state, groupId),
        ),
        activeGroupId: null,
      });
      return;
    }
    set({
      panes: state.panes.map((pane) =>
        pane.id === state.focusedPaneId ? { ...pane, target } : pane,
      ),
      maximizedPaneId: null,
      activeGroupId: null,
    });
  },
  addTarget: (target, region) => {
    const state = get();
    const existing = findPaneByTarget(state.panes, target);
    if (existing) {
      const panes = state.panes.map((pane) =>
        pane.id === existing.id ? promoteExistingPaneTarget(pane, target) : pane,
      );
      const savedGroups =
        panes.length > 1 && state.activeGroupId !== null
          ? upsertWorkspaceGroup(
              state.savedGroups,
              snapshotWorkspaceGroup({ ...state, panes }, state.activeGroupId),
            )
          : state.savedGroups;
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroups,
      });
      return true;
    }
    const savedGroup = findGroupByTarget(state.savedGroups, target);
    if (savedGroup) {
      const restored = restoredWorkspaceGroup(savedGroup, target, state.savedGroups);
      if (restored) {
        set(restored);
        return true;
      }
    }
    if (state.panes.length === 0) {
      const pane = createPane(target);
      set({
        panes: [pane],
        focusedPaneId: pane.id,
        layout: "single",
        activeGroupId: null,
      });
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
    const groupId =
      state.panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : createGroupId();
    const group = snapshotWorkspaceGroup(
      {
        panes,
        layout,
        columnRatio: state.columnRatio,
        rowRatio: state.rowRatio,
      },
      groupId,
    );
    set({
      panes,
      focusedPaneId: pane.id,
      layout,
      maximizedPaneId: null,
      savedGroups: upsertWorkspaceGroup(state.savedGroups, group),
      activeGroupId: groupId,
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
      const savedGroups =
        panes.length > 1 && state.activeGroupId !== null
          ? upsertWorkspaceGroup(
              state.savedGroups,
              snapshotWorkspaceGroup({ ...state, panes }, state.activeGroupId),
            )
          : state.savedGroups;
      set({
        panes,
        focusedPaneId: existing.id,
        maximizedPaneId: null,
        savedGroups,
      });
      return;
    }
    const savedGroup = findGroupByTarget(state.savedGroups, target);
    if (savedGroup) {
      const restored = restoredWorkspaceGroup(savedGroup, target, state.savedGroups);
      if (restored) {
        set(restored);
        return;
      }
    }
    if (!state.panes.some((pane) => pane.id === paneId)) return;
    const panes = state.panes.map((pane) => (pane.id === paneId ? { ...pane, target } : pane));
    const groupId = panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : null;
    set({
      panes,
      focusedPaneId: paneId,
      maximizedPaneId: null,
      savedGroups:
        groupId === null
          ? state.savedGroups
          : upsertWorkspaceGroup(
              state.savedGroups,
              snapshotWorkspaceGroup({ ...state, panes }, groupId),
            ),
      activeGroupId: groupId,
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
    const layout = layoutAfterPaneCount(panes.length, state.layout);
    const groupId = panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : null;
    let savedGroups = state.savedGroups;
    if (groupId !== null) {
      savedGroups = upsertWorkspaceGroup(
        savedGroups,
        snapshotWorkspaceGroup(
          {
            panes,
            layout,
            columnRatio: state.columnRatio,
            rowRatio: state.rowRatio,
          },
          groupId,
        ),
      );
    } else if (state.activeGroupId !== null) {
      savedGroups = removeWorkspaceGroup(savedGroups, state.activeGroupId);
    }
    set({
      panes,
      focusedPaneId: nextFocusedPaneId,
      layout,
      maximizedPaneId: state.maximizedPaneId === paneId ? null : state.maximizedPaneId,
      savedGroups,
      activeGroupId: groupId,
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
    const state = get();
    const groupId = state.activeGroupId ?? createGroupId();
    set({
      panes,
      focusedPaneId: sourcePaneId,
      maximizedPaneId: null,
      savedGroups: upsertWorkspaceGroup(
        state.savedGroups,
        snapshotWorkspaceGroup({ ...state, panes }, groupId),
      ),
      activeGroupId: groupId,
    });
  },
  movePaneToEnd: (paneId) => {
    const state = get();
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    if (!pane || state.panes.at(-1)?.id === paneId) return;
    const panes = [...state.panes.filter((candidate) => candidate.id !== paneId), pane];
    const groupId = state.activeGroupId ?? createGroupId();
    set({
      panes,
      focusedPaneId: paneId,
      maximizedPaneId: null,
      savedGroups: upsertWorkspaceGroup(
        state.savedGroups,
        snapshotWorkspaceGroup({ ...state, panes }, groupId),
      ),
      activeGroupId: groupId,
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
      const groupId = state.panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : null;
      return {
        columnRatio,
        savedGroups:
          groupId === null
            ? state.savedGroups
            : upsertWorkspaceGroup(
                state.savedGroups,
                snapshotWorkspaceGroup({ ...state, columnRatio }, groupId),
              ),
        activeGroupId: groupId,
      };
    }),
  setRowRatio: (ratio) =>
    set((state) => {
      const rowRatio = clampThreadWorkspaceRatio(ratio);
      const groupId = state.panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : null;
      return {
        rowRatio,
        savedGroups:
          groupId === null
            ? state.savedGroups
            : upsertWorkspaceGroup(
                state.savedGroups,
                snapshotWorkspaceGroup({ ...state, rowRatio }, groupId),
              ),
        activeGroupId: groupId,
      };
    }),
  resetLayoutRatios: () =>
    set((state) => {
      const groupId = state.panes.length > 1 ? (state.activeGroupId ?? createGroupId()) : null;
      return {
        columnRatio: 50,
        rowRatio: 50,
        savedGroups:
          groupId === null
            ? state.savedGroups
            : upsertWorkspaceGroup(
                state.savedGroups,
                snapshotWorkspaceGroup({ ...state, columnRatio: 50, rowRatio: 50 }, groupId),
              ),
        activeGroupId: groupId,
      };
    }),
  syncSavedGroups: (groups) =>
    set((state) => {
      let savedGroups = state.savedGroups;
      for (const group of groups) {
        if (savedGroups.some((candidate) => candidate.id === group.id)) continue;
        savedGroups = upsertWorkspaceGroup(savedGroups, localizeWorkspaceGroup(group, null));
      }
      return savedGroups === state.savedGroups ? state : { savedGroups };
    }),
  syncSavedGroup: (group) =>
    set((state) => {
      if (state.activeGroupId === group.id && state.panes.length > 1) return state;
      const current = state.savedGroups.find((candidate) => candidate.id === group.id) ?? null;
      const savedGroups = upsertWorkspaceGroup(
        state.savedGroups,
        localizeWorkspaceGroup(group, current),
      );
      return savedGroups === state.savedGroups ? state : { savedGroups };
    }),
  removeSavedGroup: (groupId) =>
    set((state) => {
      if (state.activeGroupId === groupId && state.panes.length > 1) return state;
      const savedGroups = removeWorkspaceGroup(state.savedGroups, groupId);
      return savedGroups.length === state.savedGroups.length ? state : { savedGroups };
    }),
  reset: () => set({ ...initialState, savedGroups: [] }),
}));

const THREAD_WORKSPACE_WINDOW_CHANNEL = "t3-thread-workspace-groups-v2";

type ThreadWorkspaceWindowMessage =
  | { readonly sourceId: string; readonly type: "request-groups" }
  | {
      readonly sourceId: string;
      readonly type: "sync-groups";
      readonly groups: ThreadWorkspaceGroupSnapshot[];
    }
  | {
      readonly sourceId: string;
      readonly type: "sync-group";
      readonly group: ThreadWorkspaceGroupSnapshot;
    }
  | { readonly sourceId: string; readonly type: "remove-group"; readonly groupId: string };

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
  if (typeof value.id !== "string" || value.id.length === 0) return false;
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

function workspaceGroupSignature(group: ThreadWorkspaceGroupSnapshot): string {
  return JSON.stringify({
    id: group.id,
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
  let applyingRemoteUpdate = false;

  const postGroups = () => {
    sendWindowMessage({
      sourceId,
      type: "sync-groups",
      groups: useThreadWorkspaceStore.getState().savedGroups,
    } satisfies ThreadWorkspaceWindowMessage);
  };

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isRecord(event.data) || event.data.sourceId === sourceId) return;
    if (event.data.type === "request-groups") {
      postGroups();
      return;
    }
    applyingRemoteUpdate = true;
    try {
      if (event.data.type === "sync-groups") {
        if (!Array.isArray(event.data.groups)) return;
        const groups = event.data.groups;
        if (!groups.every(isWorkspaceGroupSnapshot)) return;
        useThreadWorkspaceStore.getState().syncSavedGroups(groups);
        return;
      }
      if (event.data.type === "sync-group") {
        if (!isWorkspaceGroupSnapshot(event.data.group)) return;
        useThreadWorkspaceStore.getState().syncSavedGroup(event.data.group);
        return;
      }
      if (event.data.type === "remove-group" && typeof event.data.groupId === "string") {
        useThreadWorkspaceStore.getState().removeSavedGroup(event.data.groupId);
      }
    } finally {
      applyingRemoteUpdate = false;
    }
  });

  useThreadWorkspaceStore.subscribe((state, previous) => {
    if (applyingRemoteUpdate || state.savedGroups === previous.savedGroups) return;
    const previousById = new Map(previous.savedGroups.map((group) => [group.id, group]));
    for (const group of state.savedGroups) {
      const previousGroup = previousById.get(group.id);
      previousById.delete(group.id);
      if (
        previousGroup &&
        workspaceGroupSignature(previousGroup) === workspaceGroupSignature(group)
      ) {
        continue;
      }
      sendWindowMessage({
        sourceId,
        type: "sync-group",
        group,
      } satisfies ThreadWorkspaceWindowMessage);
    }
    for (const groupId of previousById.keys()) {
      sendWindowMessage({
        sourceId,
        type: "remove-group",
        groupId,
      } satisfies ThreadWorkspaceWindowMessage);
    }
  });

  sendWindowMessage({ sourceId, type: "request-groups" } satisfies ThreadWorkspaceWindowMessage);
}

startThreadWorkspaceWindowSync();
