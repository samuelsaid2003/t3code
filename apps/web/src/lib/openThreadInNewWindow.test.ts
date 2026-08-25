import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { canOpenThreadInNewWindow, openThreadInNewWindow } from "./openThreadInNewWindow.ts";

describe("openThreadInNewWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is available only when the desktop bridge can open windows", () => {
    expect(canOpenThreadInNewWindow()).toBe(false);
    vi.stubGlobal("window", { desktopBridge: { openWindow: vi.fn() } });
    expect(canOpenThreadInNewWindow()).toBe(true);
  });

  it("asks the desktop shell for a hash-routed window", () => {
    const openWindow = vi.fn(() => Promise.resolve());
    vi.stubGlobal("window", { desktopBridge: { openWindow } });

    openThreadInNewWindow({
      environmentId: EnvironmentId.make("env-1"),
      threadId: ThreadId.make("thread-9"),
    });

    expect(openWindow).toHaveBeenCalledWith({ hashPath: "/env-1/thread-9" });
  });
});
