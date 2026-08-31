import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type EnvironmentId,
} from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BotIcon, Clock3Icon, MessageSquareIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { resolveDefaultProviderModelSelection } from "~/providerInstances";
import { newThreadId } from "~/lib/utils";
import {
  useAgentThreadShells,
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useServerConfigs,
} from "~/state/entities";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarInset } from "~/components/ui/sidebar";
import { Textarea } from "~/components/ui/textarea";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { useUiStateStore } from "~/uiStateStore";
import { resolveAgentIndexTarget } from "~/components/agents/agentNavigation";

function AgentChatsIndex() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const agents = useAgentThreadShells();
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const lastAgentThreadKey = useUiStateStore((state) => state.lastAgentThreadKey);
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [creating, setCreating] = useState(false);
  const indexTarget = useMemo(
    () => resolveAgentIndexTarget(agents, lastAgentThreadKey),
    [agents, lastAgentThreadKey],
  );

  useEffect(() => {
    if (search.new || !shellsBootstrapped || !indexTarget) return;
    void navigate({
      to: "/agents/$environmentId/$threadId",
      params: {
        environmentId: indexTarget.environmentId,
        threadId: indexTarget.id,
      },
      replace: true,
    });
  }, [indexTarget, navigate, search.new, shellsBootstrapped]);
  const orderedProjects = useMemo(
    () => [...projects].sort((left, right) => left.title.localeCompare(right.title)),
    [projects],
  );
  const selectedProject = orderedProjects.find(
    (project) => `${project.environmentId}:${project.id}` === projectKey,
  );
  const canCreate =
    !creating && title.trim().length > 0 && instructions.trim().length > 0 && !!selectedProject;

  const handleCreate = async () => {
    if (!selectedProject || !canCreate) return;
    const modelSelection = resolveDefaultProviderModelSelection(
      serverConfigs.get(selectedProject.environmentId)?.providers ?? [],
      selectedProject.defaultModelSelection,
    );
    if (!modelSelection) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "No provider available",
          description: "Connect a coding provider before creating this agent.",
        }),
      );
      return;
    }

    setCreating(true);
    const threadId = newThreadId();
    const result = await createThread({
      environmentId: selectedProject.environmentId,
      input: {
        threadId,
        projectId: selectedProject.id,
        kind: "agent",
        agentProfile: {
          instructions: instructions.trim(),
          allowRoutineManagement: false,
          allowTaskManagement: false,
        },
        title: title.trim(),
        modelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
      },
    });
    setCreating(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not create agent",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
      return;
    }

    void navigate({
      to: "/agents/$environmentId/$threadId",
      params: {
        environmentId: selectedProject.environmentId as EnvironmentId,
        threadId,
      },
    });
  };

  if (!search.new && (!shellsBootstrapped || indexTarget)) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-auto bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 pb-16 pt-[calc(var(--workspace-topbar-height)+2.5rem)]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <section>
            <div className="mb-8 flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 text-primary shadow-sm">
              <BotIcon className="size-5" />
            </div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
              Agent Chats
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-balance">
              A permanent teammate, attached to real code.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Each agent is a normal T3 thread with its own durable instructions. Talk to it any
              time, or add routines that wake it while the desktop app is open.
            </p>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                {
                  Icon: MessageSquareIcon,
                  label: "Persistent chat",
                  copy: "One conversation you can always return to.",
                },
                {
                  Icon: Clock3Icon,
                  label: "Scheduled routines",
                  copy: "Once, daily, weekly, or monthly.",
                },
                {
                  Icon: SparklesIcon,
                  label: "Native T3 work",
                  copy: "Same provider, project, tools, and checkpoints.",
                },
              ].map(({ Icon, label, copy }) => (
                <div key={label} className="rounded-xl border bg-card/55 p-4">
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium">{label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="self-start rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold">Create an agent</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                You can change its model and working modes from the chat composer later.
              </p>
            </div>
            <div className="space-y-5">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  autoFocus
                  value={title}
                  onValueChange={(value) => setTitle(value)}
                  placeholder="Release captain"
                />
              </Field>
              <Field>
                <FieldLabel>Project</FieldLabel>
                <Select value={projectKey} onValueChange={(value) => setProjectKey(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectPopup>
                    {orderedProjects.map((project) => (
                      <SelectItem
                        key={`${project.environmentId}:${project.id}`}
                        value={`${project.environmentId}:${project.id}`}
                      >
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {orderedProjects.length === 0 ? (
                  <FieldDescription>
                    Add a project from the main T3 workspace first.
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Standing instructions</FieldLabel>
                <Textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.currentTarget.value)}
                  placeholder="You own releases for this repository. Keep changes small, run focused checks, and summarize risks before shipping."
                  className="min-h-32 resize-y"
                />
                <FieldDescription>
                  These instructions are prepended to manual messages and scheduled runs.
                </FieldDescription>
              </Field>
              <Button className="w-full" disabled={!canCreate} onClick={() => void handleCreate()}>
                <BotIcon className="size-4" />
                {creating ? "Creating…" : "Create agent chat"}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/agents/")({
  validateSearch: (search: Record<string, unknown>) =>
    search.new === true || search.new === "true" || search.new === "1"
      ? { new: true as const }
      : {},
  component: AgentChatsIndex,
});
