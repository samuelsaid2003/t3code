import type { ScopedThreadRef } from "@t3tools/contracts";

import { buildThreadRouteParams } from "../threadRoutes";

export function canOpenThreadInNewWindow(): boolean {
  return typeof window !== "undefined" && typeof window.desktopBridge?.openWindow === "function";
}

export function openThreadInNewWindow(threadRef: ScopedThreadRef): void {
  const { environmentId, threadId } = buildThreadRouteParams(threadRef);
  void window.desktopBridge?.openWindow?.({
    hashPath: `/${environmentId}/${threadId}`,
  });
}
