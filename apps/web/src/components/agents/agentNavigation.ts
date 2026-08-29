import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

type AgentNavigationCandidate = Pick<EnvironmentThreadShell, "environmentId" | "id" | "updatedAt">;

export function resolveAgentIndexTarget<T extends AgentNavigationCandidate>(
  agents: ReadonlyArray<T>,
  lastAgentThreadKey: string | null,
): T | null {
  const lastAgent = lastAgentThreadKey
    ? agents.find(
        (agent) =>
          scopedThreadKey(scopeThreadRef(agent.environmentId, agent.id)) === lastAgentThreadKey,
      )
    : undefined;
  if (lastAgent) return lastAgent;

  return agents.reduce<T | null>(
    (latest, agent) => (!latest || agent.updatedAt > latest.updatedAt ? agent : latest),
    null,
  );
}
