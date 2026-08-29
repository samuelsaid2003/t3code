import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  BotIcon,
  ChevronDownIcon,
  FolderIcon,
  SearchIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useAgentThreadShells, useProjects } from "~/state/entities";
import { useRightPanelStore } from "~/rightPanelStore";
import { useUiStateStore } from "~/uiStateStore";
import {
  SidebarChromeFooter,
  SidebarChromeHeader,
  SidebarModeToggle,
} from "~/components/sidebar/SidebarChrome";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "~/components/ui/menu";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const ALL_PROJECTS = "all";

export function AgentsSidebarNav() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const agents = useAgentThreadShells();
  const projects = useProjects();
  const lastThreadRouteTarget = useUiStateStore((state) => state.lastThreadRouteTarget);
  const { isMobile, setOpenMobile } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");
  const [projectScope, setProjectScope] = useState(ALL_PROJECTS);
  const orderedProjects = useMemo(
    () => [...projects].sort((left, right) => left.title.localeCompare(right.title)),
    [projects],
  );
  const projectByRef = useMemo(
    () =>
      new Map(
        projects.map((project) => [`${project.environmentId}:${project.id}`, project] as const),
      ),
    [projects],
  );
  const selectedProject =
    projectScope === ALL_PROJECTS
      ? null
      : (orderedProjects.find(
          (project) => `${project.environmentId}:${project.id}` === projectScope,
        ) ?? null);
  const visibleAgents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return [...agents]
      .filter(
        (agent) =>
          projectScope === ALL_PROJECTS ||
          `${agent.environmentId}:${agent.projectId}` === projectScope,
      )
      .filter((agent) => agent.title.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [agents, projectScope, searchQuery]);

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };
  const openNewAgent = () => {
    closeMobileSidebar();
    void navigate({ to: "/agents", search: { new: true } });
  };
  const openThreads = () => {
    closeMobileSidebar();
    if (lastThreadRouteTarget?.kind === "server") {
      void navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: lastThreadRouteTarget.environmentId,
          threadId: lastThreadRouteTarget.threadId,
        },
      });
      return;
    }
    if (lastThreadRouteTarget?.kind === "draft") {
      void navigate({
        to: "/draft/$draftId",
        params: { draftId: lastThreadRouteTarget.draftId },
      });
      return;
    }
    void navigate({ to: "/" });
  };
  const openAgent = (agent: (typeof agents)[number]) => {
    closeMobileSidebar();
    useRightPanelStore
      .getState()
      .open(scopeThreadRef(agent.environmentId, agent.id), "agent-profile");
    void navigate({
      to: "/agents/$environmentId/$threadId",
      params: { environmentId: agent.environmentId, threadId: agent.id },
    });
  };

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent
        className="gap-0"
        fixedHeader={
          <SidebarGroup className="relative z-[1] gap-1 p-[var(--sidebar-content-inset)]">
            <div className="flex items-center gap-1">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground">
                <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
                <Input
                  aria-label="Search Agent Chats"
                  className="min-w-0 flex-1 [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:p-0 [&_[data-slot=input]]:text-sm [&_[data-slot=input]]:font-medium [&_[data-slot=input]]:leading-normal [&_[data-slot=input]]:text-sidebar-foreground [&_[data-slot=input]]:placeholder:text-sidebar-muted-foreground"
                  nativeInput
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="Search"
                  type="search"
                  unstyled
                  value={searchQuery}
                />
                {searchQuery ? (
                  <Button
                    aria-label="Clear Agent Chat search"
                    className="shrink-0 text-sidebar-muted-foreground hover:bg-sidebar-control-surface hover:text-sidebar-foreground"
                    onClick={() => setSearchQuery("")}
                    size="icon-micro"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-3" />
                  </Button>
                ) : null}
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuButton
                      aria-label="New Agent Chat"
                      className="relative shrink-0 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                      onClick={openNewAgent}
                      size="icon"
                      type="button"
                    />
                  }
                >
                  <SquarePenIcon />
                </TooltipTrigger>
                <TooltipPopup side="right">New Agent Chat</TooltipPopup>
              </Tooltip>
              <SidebarModeToggle mode="agents" onSelect={openThreads} />
            </div>
            {orderedProjects.length > 0 ? (
              <Menu>
                <MenuTrigger
                  render={
                    <SidebarMenuButton
                      aria-label="Filter Agent Chats by project"
                      className="min-w-0 ps-[calc(var(--sidebar-row-content-inset)-1px)] focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    />
                  }
                >
                  {selectedProject ? (
                    <ProjectFavicon
                      className="size-4 shrink-0"
                      cwd={selectedProject.workspaceRoot}
                      environmentId={selectedProject.environmentId}
                      faviconPath={selectedProject.faviconPath}
                    />
                  ) : (
                    <FolderIcon className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {selectedProject?.title ?? "All projects"}
                  </span>
                  <ChevronDownIcon className="-mr-px size-4 shrink-0" />
                </MenuTrigger>
                <MenuPopup align="start" className="w-(--anchor-width)">
                  <MenuRadioGroup value={projectScope} onValueChange={setProjectScope}>
                    <MenuRadioItem value={ALL_PROJECTS} closeOnClick>
                      <FolderIcon className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">All projects</span>
                    </MenuRadioItem>
                    {orderedProjects.map((project) => (
                      <MenuRadioItem
                        closeOnClick
                        key={`${project.environmentId}:${project.id}`}
                        value={`${project.environmentId}:${project.id}`}
                      >
                        <ProjectFavicon
                          className="size-4 shrink-0"
                          cwd={project.workspaceRoot}
                          environmentId={project.environmentId}
                          faviconPath={project.faviconPath}
                        />
                        <span className="min-w-0 truncate">{project.title}</span>
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
            ) : null}
          </SidebarGroup>
        }
      >
        <SidebarGroup className="ps-[calc(var(--sidebar-content-inset)+1px)] pe-[var(--sidebar-content-inset)] pb-1 pt-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {visibleAgents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-sidebar-muted-foreground/60">
                  {agents.length === 0 ? (
                    <>
                      <BotIcon className="size-4" />
                      <span>No Agent Chats yet</span>
                    </>
                  ) : (
                    <span>No Agent Chats found</span>
                  )}
                </div>
              ) : (
                visibleAgents.map((agent) => {
                  const to = `/agents/${agent.environmentId}/${agent.id}`;
                  const active = pathname === to;
                  const project = projectByRef.get(`${agent.environmentId}:${agent.projectId}`);
                  return (
                    <SidebarMenuItem key={`${agent.environmentId}:${agent.id}`}>
                      <SidebarMenuButton
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "h-auto min-h-10 items-start py-2",
                          active
                            ? "bg-sidebar-row-active text-sidebar-foreground"
                            : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
                        )}
                        onClick={() => openAgent(agent)}
                      >
                        {project ? (
                          <ProjectFavicon
                            className="mt-0.5 size-4 shrink-0"
                            cwd={project.workspaceRoot}
                            environmentId={project.environmentId}
                            faviconPath={project.faviconPath}
                          />
                        ) : (
                          <BotIcon className="mt-0.5 size-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{agent.title}</span>
                          {project ? (
                            <span className="mt-0.5 block truncate text-[11px] text-sidebar-muted-foreground/65">
                              {project.title}
                            </span>
                          ) : null}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
