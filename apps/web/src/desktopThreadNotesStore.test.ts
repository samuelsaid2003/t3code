import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  DESKTOP_THREAD_NOTE_MAX_LENGTH,
  desktopThreadNoteStorageKey,
  parseDesktopThreadNote,
  readDesktopThreadNote,
  writeDesktopThreadNote,
} from "./desktopThreadNotesStore";

function threadRef(environmentId = "env-1", threadId = "thread-1") {
  return scopeThreadRef(environmentId as EnvironmentId, ThreadId.make(threadId));
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("desktopThreadNotesStore", () => {
  it("scopes notes to both environment and thread", () => {
    expect(desktopThreadNoteStorageKey(threadRef("env-a", "thread-a"))).not.toBe(
      desktopThreadNoteStorageKey(threadRef("env-b", "thread-a")),
    );
    expect(desktopThreadNoteStorageKey(threadRef("env-a", "thread-a"))).not.toBe(
      desktopThreadNoteStorageKey(threadRef("env-a", "thread-b")),
    );
  });

  it("writes and reads a versioned local note", () => {
    const storage = memoryStorage();
    const ref = threadRef();

    expect(writeDesktopThreadNote(storage, ref, "Call Samuel", 100)).toEqual({
      text: "Call Samuel",
      updatedAt: 100,
    });
    expect(readDesktopThreadNote(storage, ref)).toEqual({
      text: "Call Samuel",
      updatedAt: 100,
    });
  });

  it("clears the persisted record when the note becomes empty", () => {
    const storage = memoryStorage();
    const ref = threadRef();
    writeDesktopThreadNote(storage, ref, "Temporary", 100);

    expect(writeDesktopThreadNote(storage, ref, "", 101)).toEqual({ text: "", updatedAt: 0 });
    expect(storage.getItem(desktopThreadNoteStorageKey(ref))).toBeNull();
  });

  it("keeps timestamps monotonic when two saves share a clock tick", () => {
    const storage = memoryStorage();
    const ref = threadRef();
    writeDesktopThreadNote(storage, ref, "First", 100);

    expect(writeDesktopThreadNote(storage, ref, "Second", 100).updatedAt).toBe(101);
  });

  it("rejects corrupt, unsupported, and oversized persisted values", () => {
    expect(parseDesktopThreadNote("not-json")).toEqual({ text: "", updatedAt: 0 });
    expect(parseDesktopThreadNote('{"version":2,"text":"old","updatedAt":1}')).toEqual({
      text: "",
      updatedAt: 0,
    });
    expect(
      parseDesktopThreadNote(
        JSON.stringify({
          version: 1,
          text: "x".repeat(DESKTOP_THREAD_NOTE_MAX_LENGTH + 1),
          updatedAt: 1,
        }),
      ),
    ).toEqual({ text: "", updatedAt: 0 });
  });

  it("bounds writes to the desktop note limit", () => {
    const storage = memoryStorage();
    const ref = threadRef();
    const snapshot = writeDesktopThreadNote(
      storage,
      ref,
      "x".repeat(DESKTOP_THREAD_NOTE_MAX_LENGTH + 25),
      100,
    );

    expect(snapshot.text).toHaveLength(DESKTOP_THREAD_NOTE_MAX_LENGTH);
  });
});
