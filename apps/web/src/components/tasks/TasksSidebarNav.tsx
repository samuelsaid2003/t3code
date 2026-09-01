import { useAtomValue } from "@effect/atom-react";
import { CheckCircle2Icon, CheckSquare2Icon, CircleDashedIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { isElectron } from "~/env";
import { environmentTasks } from "~/state/tasks";
import {
  SidebarChromeFooter,
  SidebarChromeHeader,
  SidebarModeToggle,
} from "~/components/sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup } from "~/components/ui/sidebar";

export function TasksSidebarNav() {
  const navigate = useNavigate();
  const tasks = useAtomValue(environmentTasks.tasksAtom);
  const incomplete = tasks.filter((task) => task.status !== "done").length;
  const completed = tasks.length - incomplete;

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="gap-0">
        <SidebarGroup className="p-[var(--sidebar-content-inset)]">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm font-semibold text-sidebar-foreground">
              <CheckSquare2Icon className="size-4" />
              Tasks
            </div>
            <SidebarModeToggle
              mode="tasks"
              onSelect={(mode) => void navigate({ to: mode === "agents" ? "/agents" : "/" })}
            />
          </div>
        </SidebarGroup>
        <SidebarGroup className="space-y-2 px-[var(--sidebar-content-inset)]">
          <div className="rounded-lg border border-sidebar-border/70 bg-sidebar-control-surface/55 p-3">
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
              <CircleDashedIcon className="size-3.5 text-amber-500" />
              <span className="flex-1">Open</span>
              <span className="tabular-nums text-sidebar-muted-foreground">{incomplete}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-sidebar-foreground">
              <CheckCircle2Icon className="size-3.5 text-emerald-500" />
              <span className="flex-1">Completed</span>
              <span className="tabular-nums text-sidebar-muted-foreground">{completed}</span>
            </div>
          </div>
          <p className="px-1 text-[11px] leading-5 text-sidebar-muted-foreground">
            Tasks sync from every connected environment and are available to permitted Agent Chats.
          </p>
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
