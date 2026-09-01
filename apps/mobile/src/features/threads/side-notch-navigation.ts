import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import {
  agentThreadShells,
  mobileThreadShellKey,
  sortAgentThreadShells,
  standardThreadShells,
  type MobileThreadListMode,
} from "../agents/agent-chat-navigation";

export type SideNotchMode = Exclude<MobileThreadListMode, "tasks">;

const DEFAULT_WHEEL_LIMIT = 18;

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

export function sideNotchWheelThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  current: Pick<EnvironmentThreadShell, "environmentId" | "id">,
  limit = DEFAULT_WHEEL_LIMIT,
): ReadonlyArray<EnvironmentThreadShell> {
  if (threads.length <= limit) return threads;

  const recent = threads.slice(0, limit);
  if (sideNotchThreadIndex(recent, current) >= 0) return recent;

  const currentThread = threads[sideNotchThreadIndex(threads, current)];
  return currentThread ? [...recent.slice(0, -1), currentThread] : recent;
}

export function sideNotchSelectionIndex(input: {
  readonly currentIndex: number;
  readonly threadCount: number;
  readonly translationY: number;
  readonly rowHeight?: number;
  readonly velocityY?: number;
}): number {
  "worklet";
  if (input.currentIndex < 0 || input.threadCount <= 0) return -1;
  const rowHeight = input.rowHeight ?? 44;
  const projectedVelocity = Math.max(
    -rowHeight * 2,
    Math.min(rowHeight * 2, (input.velocityY ?? 0) * 0.1),
  );
  const projectedTranslation = input.translationY + projectedVelocity;
  const nextIndex = input.currentIndex - Math.round(projectedTranslation / rowHeight);
  return Math.max(0, Math.min(input.threadCount - 1, nextIndex));
}

export function sideNotchSnapOffset(input: {
  readonly currentIndex: number;
  readonly selectedIndex: number;
  readonly rowHeight?: number;
}): number {
  "worklet";
  return (input.currentIndex - input.selectedIndex) * (input.rowHeight ?? 44);
}
