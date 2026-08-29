import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

export type MobileThreadListMode = "threads" | "agents";

export function mobileThreadShellKey(
  thread: Pick<EnvironmentThreadShell, "environmentId" | "id">,
): string {
  return `${thread.environmentId}:${thread.id}`;
}

export function standardThreadShells(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyArray<EnvironmentThreadShell> {
  return threads.filter((thread) => (thread.kind ?? "standard") === "standard");
}

export function agentThreadShells(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyArray<EnvironmentThreadShell> {
  return threads.filter((thread) => thread.kind === "agent");
}

export function sortAgentThreadShells(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyArray<EnvironmentThreadShell> {
  return [...threads].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    return updated === 0 ? right.createdAt.localeCompare(left.createdAt) : updated;
  });
}

export function resolveAgentThreadForModeSwitch(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  lastAgentThreadKey: string | undefined,
): EnvironmentThreadShell | null {
  const agents = sortAgentThreadShells(agentThreadShells(threads));
  if (lastAgentThreadKey) {
    const saved = agents.find((thread) => mobileThreadShellKey(thread) === lastAgentThreadKey);
    if (saved) return saved;
  }
  return agents[0] ?? null;
}

export function listModeForOpenedThread(
  thread: Pick<EnvironmentThreadShell, "kind">,
): MobileThreadListMode {
  return thread.kind === "agent" ? "agents" : "threads";
}
