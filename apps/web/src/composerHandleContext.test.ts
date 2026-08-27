import { describe, expect, it, vi } from "vite-plus/test";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import { publishFocusedComposerHandle, type ComposerHandleRef } from "./composerHandleContext";

function composerHandle(label: string): ChatComposerHandle {
  return {
    focusAtEnd: vi.fn(),
    focusAt: vi.fn(),
    addDroppedFiles: vi.fn(),
    insertTextAtEnd: vi.fn(() => false),
    openModelPicker: vi.fn(),
    toggleModelPicker: vi.fn(),
    isModelPickerOpen: vi.fn(() => false),
    compactContext: vi.fn(),
    readSnapshot: vi.fn(() => ({
      value: label,
      cursor: 0,
      expandedCursor: 0,
      terminalContextIds: [],
    })),
    resetCursorState: vi.fn(),
    addTerminalContext: vi.fn(),
    getSendContext: vi.fn(() => {
      throw new Error("not used");
    }),
    validateProviderInput: vi.fn(() => true),
  };
}

describe("publishFocusedComposerHandle", () => {
  it("keeps a 2x2 workspace's global handle scoped to the focused pane", () => {
    const globalRef = { current: null } as ComposerHandleRef;
    const handles = [
      composerHandle("pane-1"),
      composerHandle("pane-2"),
      composerHandle("pane-3"),
      composerHandle("pane-4"),
    ];

    for (const [index, handle] of handles.entries()) {
      publishFocusedComposerHandle({
        globalRef,
        previousHandle: null,
        nextHandle: handle,
        focused: index === 1,
      });
    }

    expect(globalRef.current).toBe(handles[1]);

    const refreshedUnfocusedHandle = composerHandle("pane-4-refreshed");
    publishFocusedComposerHandle({
      globalRef,
      previousHandle: handles[3]!,
      nextHandle: refreshedUnfocusedHandle,
      focused: false,
    });
    expect(globalRef.current).toBe(handles[1]);

    publishFocusedComposerHandle({
      globalRef,
      previousHandle: handles[1]!,
      nextHandle: null,
      focused: true,
    });
    publishFocusedComposerHandle({
      globalRef,
      previousHandle: refreshedUnfocusedHandle,
      nextHandle: refreshedUnfocusedHandle,
      focused: true,
    });
    expect(globalRef.current).toBe(refreshedUnfocusedHandle);
  });

  it("does not clear a newer focused pane when an older pane unmounts", () => {
    const first = composerHandle("first");
    const second = composerHandle("second");
    const globalRef = { current: second } as ComposerHandleRef;

    publishFocusedComposerHandle({
      globalRef,
      previousHandle: first,
      nextHandle: null,
      focused: true,
    });

    expect(globalRef.current).toBe(second);
  });
});
