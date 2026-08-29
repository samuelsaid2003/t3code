import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { isElectron } from "~/env";
import { useAgentThreadShells } from "~/state/entities";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";

interface RunSignal {
  status: "running" | "completed" | "failed";
  attentionAt: string | null;
}

export function AgentRoutineNotifications() {
  const navigate = useNavigate();
  const agents = useAgentThreadShells();
  const previousSignalsRef = useRef<Map<string, RunSignal> | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const nextSignals = new Map<string, RunSignal>();
    const previousSignals = previousSignalsRef.current;

    const notify = (input: {
      title: string;
      body: string;
      environmentId: string;
      agentThreadId: string;
      tone: "success" | "error" | "warning";
    }) => {
      toastManager.add(
        stackedThreadToast({
          type: input.tone,
          title: input.title,
          description: input.body,
        }),
      );
      if (typeof Notification === "undefined" || Notification.permission === "denied") return;
      const openNotification = () => {
        const notification = new Notification(input.title, { body: input.body });
        notification.onclick = () => {
          window.focus();
          void navigate({
            to: "/agents/$environmentId/$threadId",
            params: {
              environmentId: input.environmentId,
              threadId: input.agentThreadId,
            },
          });
          notification.close();
        };
      };
      if (Notification.permission === "default") {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") openNotification();
        });
      } else {
        openNotification();
      }
    };

    for (const agent of agents) {
      for (const run of agent.agentRuns ?? []) {
        const key = `${agent.environmentId}:${agent.id}:${run.id}`;
        const signal = {
          status: run.status,
          attentionAt: run.attentionAt ?? null,
        } satisfies RunSignal;
        nextSignals.set(key, signal);
        const previous = previousSignals?.get(key);
        if (!previous) continue;
        const routineName =
          agent.agentRoutines?.find((routine) => routine.id === run.routineId)?.name ??
          "Scheduled routine";

        if (previous.status === "running" && run.status === "completed") {
          notify({
            title: `${agent.title}: ${routineName} completed`,
            body: run.summary ?? "The scheduled agent run finished.",
            environmentId: agent.environmentId,
            agentThreadId: agent.id,
            tone: "success",
          });
        } else if (previous.status === "running" && run.status === "failed") {
          notify({
            title: `${agent.title}: ${routineName} failed`,
            body: run.error ?? "The scheduled agent run failed.",
            environmentId: agent.environmentId,
            agentThreadId: agent.id,
            tone: "error",
          });
        }

        if (signal.attentionAt !== null && signal.attentionAt !== previous.attentionAt) {
          notify({
            title: `${agent.title} needs attention`,
            body: run.attentionSummary ?? `${routineName} is waiting for you.`,
            environmentId: agent.environmentId,
            agentThreadId: agent.id,
            tone: "warning",
          });
        }
      }
    }

    previousSignalsRef.current = nextSignals;
  }, [agents, navigate]);

  return null;
}
