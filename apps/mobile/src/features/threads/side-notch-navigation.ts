import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import {
  agentThreadShells,
  mobileThreadShellKey,
  sortAgentThreadShells,
  standardThreadShells,
  type MobileThreadListMode,
} from "../agents/agent-chat-navigation";

export type SideNotchMode = Exclude<MobileThreadListMode, "tasks">;

export function sideNotchThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  mode: SideNotchMode,
): ReadonlyArray<EnvironmentThreadShell> {
  const active = threads.filter((thread) => thread.archivedAt === null);
  return mode === "agents"
    ? sortAgentThreadShells(agentThreadShells(active))
    : [...standardThreadShells(active)].sort((left, right) => {
        const updated = right.updatedAt.localeCompare(left.updatedAt);
        return updated === 0 ? right.createdAt.localeCompare(left.createdAt) : updated;
      });
}

export function sideNotchThreadIndex(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  current: Pick<EnvironmentThreadShell, "environmentId" | "id">,
): number {
  const currentKey = mobileThreadShellKey(current);
  return threads.findIndex((thread) => mobileThreadShellKey(thread) === currentKey);
}

export function sideNotchPreviewIndex(input: {
  readonly currentIndex: number;
  readonly threadCount: number;
  readonly translationY: number;
  readonly threshold?: number;
}): number {
  if (input.currentIndex < 0 || input.threadCount <= 0) return -1;
  const threshold = input.threshold ?? 42;
  const magnitude = Math.floor(Math.abs(input.translationY) / threshold);
  const direction = input.translationY < 0 ? 1 : input.translationY > 0 ? -1 : 0;
  return Math.max(0, Math.min(input.threadCount - 1, input.currentIndex + direction * magnitude));
}
