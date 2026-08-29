import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { ThreadWorkspaceRouteTarget } from "~/components/thread-workspace/ThreadWorkspaceHost";
import { useAllEnvironmentShellsBootstrapped, useThreadShell } from "~/state/entities";
import { useRightPanelStore } from "~/rightPanelStore";
import { useUiStateStore } from "~/uiStateStore";

function AgentChatRoute() {
  const navigate = useNavigate();
  const params = Route.useParams();
  const threadRef = useMemo(
    () => scopeThreadRef(EnvironmentId.make(params.environmentId), ThreadId.make(params.threadId)),
    [params.environmentId, params.threadId],
  );
  const thread = useThreadShell(threadRef);
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const setLastAgentThreadKey = useUiStateStore((state) => state.setLastAgentThreadKey);

  useEffect(() => {
    useRightPanelStore.getState().open(threadRef, "agent-profile");
  }, [threadRef]);

  useEffect(() => {
    if (shellsBootstrapped && thread?.kind !== "agent") {
      void navigate({ to: "/agents", replace: true });
    }
  }, [navigate, shellsBootstrapped, thread]);

  useEffect(() => {
    if (thread?.kind !== "agent") return;
    setLastAgentThreadKey(scopedThreadKey(threadRef));
  }, [setLastAgentThreadKey, thread?.kind, threadRef]);

  return thread?.kind === "agent" ? (
    <ThreadWorkspaceRouteTarget target={{ kind: "server", threadRef }} />
  ) : null;
}

export const Route = createFileRoute("/agents/$environmentId/$threadId")({
  component: AgentChatRoute,
});
