import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { isElectron } from "./env";

export const DESKTOP_THREAD_NOTE_MAX_LENGTH = 16_000;

const DESKTOP_THREAD_NOTE_STORAGE_PREFIX = "t3code:desktop-thread-note:v1:";
const DESKTOP_THREAD_NOTE_WINDOW_CHANNEL = "t3-desktop-thread-notes-v1";

export interface DesktopThreadNoteSnapshot {
  readonly text: string;
  readonly updatedAt: number;
}

export type DesktopThreadNoteSaveStatus = "saved" | "saving" | "conflict" | "error";

const EMPTY_NOTE: DesktopThreadNoteSnapshot = { text: "", updatedAt: 0 };
const snapshots = new Map<string, DesktopThreadNoteSnapshot>();
const listeners = new Map<string, Set<() => void>>();

let noteChannel: BroadcastChannel | null = null;
let postNoteWindowMessage: ((message: unknown) => void) | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function desktopThreadNoteStorageKey(threadRef: ScopedThreadRef): string {
  return `${DESKTOP_THREAD_NOTE_STORAGE_PREFIX}${threadRef.environmentId}:${threadRef.threadId}`;
}

export function parseDesktopThreadNote(raw: string | null): DesktopThreadNoteSnapshot {
  if (raw === null) return EMPTY_NOTE;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.text !== "string" ||
      value.text.length > DESKTOP_THREAD_NOTE_MAX_LENGTH ||
      typeof value.updatedAt !== "number" ||
      !Number.isFinite(value.updatedAt) ||
      value.updatedAt <= 0
    ) {
      return EMPTY_NOTE;
    }
    return { text: value.text, updatedAt: value.updatedAt };
  } catch {
    return EMPTY_NOTE;
  }
}

export function readDesktopThreadNote(
  storage: Pick<Storage, "getItem">,
  threadRef: ScopedThreadRef,
): DesktopThreadNoteSnapshot {
  try {
    return parseDesktopThreadNote(storage.getItem(desktopThreadNoteStorageKey(threadRef)));
  } catch {
    return EMPTY_NOTE;
  }
}

export function writeDesktopThreadNote(
  storage: Pick<Storage, "getItem" | "removeItem" | "setItem">,
  threadRef: ScopedThreadRef,
  text: string,
  now = Date.now(),
): DesktopThreadNoteSnapshot {
  const key = desktopThreadNoteStorageKey(threadRef);
  const normalizedText = text.slice(0, DESKTOP_THREAD_NOTE_MAX_LENGTH);
  if (normalizedText.length === 0) {
    storage.removeItem(key);
    return EMPTY_NOTE;
  }

  const previous = parseDesktopThreadNote(storage.getItem(key));
  const updatedAt = Math.max(now, previous.updatedAt + 1);
  const snapshot = { text: normalizedText, updatedAt } satisfies DesktopThreadNoteSnapshot;
  storage.setItem(key, JSON.stringify({ version: 1, ...snapshot }));
  return snapshot;
}

function runtimeStorage(): Storage | null {
  if (!isElectron || typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify(key: string) {
  for (const listener of listeners.get(key) ?? []) listener();
}

function invalidate(key: string) {
  snapshots.delete(key);
  notify(key);
}

function snapshotFor(threadRef: ScopedThreadRef): DesktopThreadNoteSnapshot {
  const key = desktopThreadNoteStorageKey(threadRef);
  const cached = snapshots.get(key);
  if (cached) return cached;
  const storage = runtimeStorage();
  const snapshot = storage ? readDesktopThreadNote(storage, threadRef) : EMPTY_NOTE;
  snapshots.set(key, snapshot);
  return snapshot;
}

function subscribeToNote(key: string, listener: () => void) {
  const keyListeners = listeners.get(key) ?? new Set<() => void>();
  keyListeners.add(listener);
  listeners.set(key, keyListeners);
  return () => {
    keyListeners.delete(listener);
    if (keyListeners.size === 0) listeners.delete(key);
  };
}

function startDesktopThreadNoteWindowSync() {
  if (!isElectron || typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(DESKTOP_THREAD_NOTE_STORAGE_PREFIX)) invalidate(event.key);
  });

  if (typeof BroadcastChannel === "undefined") return;
  noteChannel = new BroadcastChannel(DESKTOP_THREAD_NOTE_WINDOW_CHANNEL);
  postNoteWindowMessage = noteChannel.postMessage.bind(noteChannel);
  noteChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isRecord(event.data) || event.data.type !== "note-updated") return;
    if (typeof event.data.key !== "string") return;
    if (!event.data.key.startsWith(DESKTOP_THREAD_NOTE_STORAGE_PREFIX)) return;
    invalidate(event.data.key);
  });
}

startDesktopThreadNoteWindowSync();

export function saveDesktopThreadNote(
  threadRef: ScopedThreadRef,
  text: string,
): DesktopThreadNoteSnapshot {
  const storage = runtimeStorage();
  if (!storage) throw new Error("Desktop thread-note storage is unavailable.");
  const key = desktopThreadNoteStorageKey(threadRef);
  const snapshot = writeDesktopThreadNote(storage, threadRef, text);
  snapshots.set(key, snapshot);
  notify(key);
  postNoteWindowMessage?.({ type: "note-updated", key });
  return snapshot;
}

export function useDesktopThreadNote(threadRef: ScopedThreadRef): DesktopThreadNoteSnapshot {
  const key = desktopThreadNoteStorageKey(threadRef);
  const subscribe = useCallback((listener: () => void) => subscribeToNote(key, listener), [key]);
  const getSnapshot = useCallback(() => snapshotFor(threadRef), [key, threadRef]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_NOTE);
}

export function useDesktopThreadNoteEditor(threadRef: ScopedThreadRef) {
  const key = desktopThreadNoteStorageKey(threadRef);
  const stableThreadRef = useMemo(() => threadRef, [key]);
  const persisted = useDesktopThreadNote(stableThreadRef);
  const [editor, setEditor] = useState(() => ({
    key,
    text: persisted.text,
    baselineUpdatedAt: persisted.updatedAt,
    dirty: false,
    conflict: false,
    error: false,
  }));
  const current =
    editor.key === key
      ? editor
      : {
          key,
          text: persisted.text,
          baselineUpdatedAt: persisted.updatedAt,
          dirty: false,
          conflict: false,
          error: false,
        };
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    setEditor((state) => {
      if (state.key !== key) {
        return {
          key,
          text: persisted.text,
          baselineUpdatedAt: persisted.updatedAt,
          dirty: false,
          conflict: false,
          error: false,
        };
      }
      if (persisted.updatedAt === state.baselineUpdatedAt) return state;
      if (state.dirty) return state.conflict ? state : { ...state, conflict: true };
      return {
        ...state,
        text: persisted.text,
        baselineUpdatedAt: persisted.updatedAt,
        conflict: false,
        error: false,
      };
    });
  }, [key, persisted.text, persisted.updatedAt]);

  const changeText = useCallback(
    (text: string) => {
      setEditor((state) => ({
        ...(state.key === key ? state : current),
        text: text.slice(0, DESKTOP_THREAD_NOTE_MAX_LENGTH),
        dirty: true,
        error: false,
      }));
    },
    [current, key],
  );

  const save = useCallback(
    (force = false) => {
      const active = currentRef.current;
      if (active.key !== key || !active.dirty || (active.conflict && !force)) return false;
      try {
        const snapshot = saveDesktopThreadNote(stableThreadRef, active.text);
        setEditor({
          ...active,
          text: snapshot.text,
          baselineUpdatedAt: snapshot.updatedAt,
          dirty: false,
          conflict: false,
          error: false,
        });
        return true;
      } catch {
        setEditor({ ...active, error: true });
        return false;
      }
    },
    [key, stableThreadRef],
  );

  useEffect(() => {
    if (!current.dirty || current.conflict) return;
    const timeout = window.setTimeout(() => save(), 650);
    return () => window.clearTimeout(timeout);
  }, [current.conflict, current.dirty, current.text, save]);

  useEffect(
    () => () => {
      const active = editorRef.current;
      if (active.key !== key || !active.dirty || active.conflict) return;
      try {
        saveDesktopThreadNote(stableThreadRef, active.text);
      } catch {
        // The editor is leaving the screen, so there is nowhere useful to
        // surface a storage failure. Normal in-place saves retain retry UI.
      }
    },
    [key, stableThreadRef],
  );

  const useLatest = useCallback(() => {
    setEditor({
      key,
      text: persisted.text,
      baselineUpdatedAt: persisted.updatedAt,
      dirty: false,
      conflict: false,
      error: false,
    });
  }, [key, persisted.text, persisted.updatedAt]);
  const keepMine = useCallback(() => save(true), [save]);
  const clear = useCallback(() => {
    const active = currentRef.current;
    if (active.key !== key) return false;
    try {
      const snapshot = saveDesktopThreadNote(stableThreadRef, "");
      setEditor({
        ...active,
        text: "",
        baselineUpdatedAt: snapshot.updatedAt,
        dirty: false,
        conflict: false,
        error: false,
      });
      return true;
    } catch {
      setEditor({ ...active, error: true });
      return false;
    }
  }, [key, stableThreadRef]);

  const status = useMemo<DesktopThreadNoteSaveStatus>(() => {
    if (current.conflict) return "conflict";
    if (current.error) return "error";
    return current.dirty ? "saving" : "saved";
  }, [current.conflict, current.dirty, current.error]);

  return {
    text: current.text,
    status,
    changeText,
    clear,
    save,
    keepMine,
    useLatest,
  };
}
