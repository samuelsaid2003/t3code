import {
  ArrowLeftIcon,
  BotIcon,
  ChartNoAxesColumnIcon,
  CheckSquare2Icon,
  GitPullRequestIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { useAtomValue } from "@effect/atom-react";
import { memo, useCallback, useRef, useState } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { environmentTasks } from "../../state/tasks";
import { useAtomCommand } from "../../state/use-atom-command";
import { ClaudeAI, GrokIcon, OpenAI } from "../Icons";
import {
  formatProviderUsageReset,
  type ClaudeSidebarUsage,
  type ProviderSidebarUsage,
  resolveClaudeSidebarUsage,
  resolveProviderSidebarUsage,
} from "./providerSidebarUsage";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "focus-visible:ring-white/90 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white! [:hover,[data-pressed]]:bg-white/15",
          backdropVariant && resolveSidebarStageFocusRingOffsetClass(backdropVariant),
        )}
      />
      <SidebarBrand onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark />
      <span
        className={cn(
          "-translate-y-px truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </Link>
  );
}

function T3Wordmark() {
  return (
    <svg
      aria-label="T3"
      className="h-2.5 w-auto shrink-0"
      viewBox="15.5309 37 94.3941 56.96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M33.4509 93V47.56H15.5309V37H64.3309V47.56H46.4109V93H33.4509ZM86.7253 93.96C82.832 93.96 78.9653 93.4533 75.1253 92.44C71.2853 91.3733 68.032 89.88 65.3653 87.96L70.4053 78.04C72.5386 79.5867 75.0186 80.8133 77.8453 81.72C80.672 82.6267 83.5253 83.08 86.4053 83.08C89.6586 83.08 92.2186 82.44 94.0853 81.16C95.952 79.88 96.8853 78.12 96.8853 75.88C96.8853 73.7467 96.0586 72.0667 94.4053 70.84C92.752 69.6133 90.0853 69 86.4053 69H80.4853V60.44L96.0853 42.76L97.5253 47.4H68.1653V37H107.365V45.4L91.8453 63.08L85.2853 59.32H89.0453C95.9253 59.32 101.125 60.8667 104.645 63.96C108.165 67.0533 109.925 71.0267 109.925 75.88C109.925 79.0267 109.099 81.9867 107.445 84.76C105.792 87.48 103.259 89.6933 99.8453 91.4C96.432 93.1067 92.0586 93.96 86.7253 93.96Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export type SidebarMode = "threads" | "agents" | "tasks";

export const SidebarModeToggle = memo(function SidebarModeToggle({
  mode,
  onSelect,
}: {
  mode: SidebarMode;
  onSelect: (mode: SidebarMode) => void;
}) {
  if (!isElectron) return null;

  const items = [
    {
      mode: "threads" as const,
      label: "Threads",
      icon: <MessageSquareIcon />,
    },
    {
      mode: "agents" as const,
      label: "Agent Chats",
      icon: <BotIcon />,
    },
    {
      mode: "tasks" as const,
      label: "Tasks",
      icon: <CheckSquare2Icon />,
    },
  ];

  return (
    <div
      aria-label="Sidebar view"
      className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-sidebar-border/65 bg-sidebar-control-surface/70 p-0.5 shadow-xs"
      role="group"
    >
      {items.map((item) => {
        const active = item.mode === mode;
        return (
          <Tooltip key={item.mode}>
            <TooltipTrigger
              render={
                <button
                  aria-label={item.label}
                  aria-pressed={active}
                  className={cn(
                    "flex size-6.5 cursor-pointer items-center justify-center rounded-md outline-hidden transition-colors [&_svg]:size-3.5",
                    active
                      ? "bg-sidebar-row-active text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border/65"
                      : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                  )}
                  onClick={active ? undefined : () => onSelect(item.mode)}
                  type="button"
                >
                  {item.icon}
                </button>
              }
            />
            <TooltipPopup side="bottom">{item.label}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
});

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : /^\/agents(?:\/|$)/.test(location.pathname)
          ? "agents"
          : /^\/projects\/[^/]+\/?$/.test(location.pathname)
            ? "project-settings"
            : location.pathname === "/usage"
              ? "usage"
              : location.pathname === "/pull-requests"
                ? "pull-requests"
                : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/pull-requests", search: { involvement: "all", state: "open" } });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <SidebarMenu className="flex-row items-center">
      {currentFooterPage && currentFooterPage !== "agents" ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<GitPullRequestIcon />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label="Usage"
            onClick={handleUsageClick}
          />
        </>
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

function SidebarClaudeUsageMeter({
  provider,
  refreshing,
  usage,
  onRefresh,
}: {
  provider: ServerProvider;
  refreshing: boolean;
  usage: ClaudeSidebarUsage;
  onRefresh: () => void;
}) {
  return (
    <section
      aria-label="Claude subscription usage"
      className="rounded-lg border border-sidebar-border/70 bg-sidebar-control-surface/55 p-2"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ClaudeAI className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
          Claude
        </span>
        <span className="text-[9px] font-semibold tracking-[0.12em] text-[#c56243] dark:text-[#e28b70]">
          REMAINING
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={`Refresh ${provider.displayName} usage`}
                className="rounded-sm p-0.5 text-sidebar-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={refreshing}
                onClick={onRefresh}
                type="button"
              >
                <RefreshCwIcon className={cn("size-3", refreshing && "animate-spin")} />
              </button>
            }
          />
          <TooltipPopup side="top">Refresh now · updates automatically every 5 min</TooltipPopup>
        </Tooltip>
      </div>

      <div className="space-y-2">
        {usage.metrics.map((metric) => {
          const resetLabel = formatProviderUsageReset(metric.resetsAt);
          return (
            <div key={metric.id}>
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-none">
                <span className="truncate text-sidebar-foreground">{metric.label}</span>
                <span className="shrink-0 tabular-nums text-[#c56243] dark:text-[#e28b70]">
                  {metric.remainingPercent}% remaining
                </span>
              </div>
              {resetLabel ? (
                <div className="mt-1 text-[10px] leading-none text-sidebar-muted-foreground">
                  {resetLabel}
                </div>
              ) : null}
              <div
                aria-label={`${metric.label}: ${metric.remainingPercent}% remaining`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={metric.remainingPercent}
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#d97757]/15"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-[#d97757]"
                  style={{ width: `${metric.remainingPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SidebarProviderUsageMeter({
  provider,
  refreshing,
  usage,
  onRefresh,
}: {
  provider: ServerProvider;
  refreshing: boolean;
  usage: ProviderSidebarUsage;
  onRefresh: () => void;
}) {
  const isClaude = provider.driver === "claudeAgent";
  const Mark =
    provider.driver === "codex" ? OpenAI : provider.driver === "grok" ? GrokIcon : ClaudeAI;
  const resetLabel = formatProviderUsageReset(usage.resetsAt);

  return (
    <section
      aria-label={`${usage.providerName} subscription usage`}
      className="rounded-lg border border-sidebar-border/70 bg-sidebar-control-surface/55 p-2"
    >
      <div className="flex items-center gap-1.5">
        <Mark className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
          {usage.providerName}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums",
            isClaude ? "text-[#c56243] dark:text-[#e28b70]" : "text-sidebar-foreground",
          )}
        >
          {usage.remainingPercent}% remaining
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={`Refresh ${provider.displayName} usage`}
                className="rounded-sm p-0.5 text-sidebar-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={refreshing}
                onClick={onRefresh}
                type="button"
              >
                <RefreshCwIcon className={cn("size-3", refreshing && "animate-spin")} />
              </button>
            }
          />
          <TooltipPopup side="top">Refresh now · updates automatically every 5 min</TooltipPopup>
        </Tooltip>
      </div>
      <div
        aria-label={`${usage.providerName}: ${usage.remainingPercent}% remaining`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={usage.remainingPercent}
        className={cn(
          "mt-1.5 h-1 overflow-hidden rounded-full",
          isClaude ? "bg-[#d97757]/15" : "bg-sidebar-foreground/15",
        )}
        role="progressbar"
      >
        <div
          className={cn("h-full rounded-full", isClaude ? "bg-[#d97757]" : "bg-sidebar-foreground")}
          style={{ width: `${usage.remainingPercent}%` }}
        />
      </div>
      {resetLabel ? (
        <div className="mt-1 text-[10px] leading-none text-sidebar-muted-foreground">
          {resetLabel}
        </div>
      ) : null}
    </section>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const refreshServerProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [refreshingUsageInstanceId, setRefreshingUsageInstanceId] = useState<
    ServerProvider["instanceId"] | null
  >(null);
  const refreshInFlightRef = useRef(false);
  const claudeUsageProviders = providers.flatMap((provider) => {
    const usage = resolveClaudeSidebarUsage(provider);
    return usage ? [{ provider, usage }] : [];
  });
  const usageProviders = providers.flatMap((provider) => {
    if (resolveClaudeSidebarUsage(provider)) return [];
    const usage = resolveProviderSidebarUsage(provider);
    return usage ? [{ provider, usage }] : [];
  });
  const refreshProviderUsage = useCallback(
    (instanceId: ServerProvider["instanceId"]) => {
      if (refreshInFlightRef.current || primaryEnvironmentId === null) {
        return;
      }
      refreshInFlightRef.current = true;
      setRefreshingUsageInstanceId(instanceId);
      void refreshServerProviders({
        environmentId: primaryEnvironmentId,
        input: { instanceId },
      }).finally(() => {
        refreshInFlightRef.current = false;
        setRefreshingUsageInstanceId(null);
      });
    },
    [primaryEnvironmentId, refreshServerProviders],
  );

  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      {isElectron ? <SidebarTasksCard /> : null}
      {claudeUsageProviders.map(({ provider, usage }) => (
        <SidebarClaudeUsageMeter
          key={provider.instanceId}
          onRefresh={() => refreshProviderUsage(provider.instanceId)}
          provider={provider}
          refreshing={refreshingUsageInstanceId !== null}
          usage={usage}
        />
      ))}
      {usageProviders.map(({ provider, usage }) => (
        <SidebarProviderUsageMeter
          key={provider.instanceId}
          onRefresh={() => refreshProviderUsage(provider.instanceId)}
          provider={provider}
          refreshing={refreshingUsageInstanceId !== null}
          usage={usage}
        />
      ))}
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});

function SidebarTasksCard() {
  const navigate = useNavigate();
  const tasks = useAtomValue(environmentTasks.tasksAtom);
  const [expanded, setExpanded] = useState(false);
  const incomplete = tasks
    .filter((task) => task.status !== "done")
    .toSorted((left, right) => {
      if (left.dueAt === null && right.dueAt !== null) return 1;
      if (left.dueAt !== null && right.dueAt === null) return -1;
      return (
        (left.dueAt ?? "").localeCompare(right.dueAt ?? "") ||
        left.createdAt.localeCompare(right.createdAt)
      );
    });
  const visible = incomplete.slice(0, 5);
  const nearest = visible[0];

  const dueLabel = (dueAt: string | null) => {
    if (!dueAt) return "No due date";
    const date = new Date(dueAt);
    const overdue = date.getTime() < Date.now();
    const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
      date,
    );
    return overdue ? `Overdue · ${label}` : `Due ${label}`;
  };

  return (
    <section className="overflow-hidden rounded-lg border border-sidebar-border/70 bg-sidebar-control-surface/55">
      <button
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left outline-hidden hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <CheckSquare2Icon className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted-foreground uppercase">
            Tasks
          </span>
          {!expanded ? (
            <span className="block truncate text-xs text-sidebar-foreground">
              {nearest?.title ?? "No incomplete tasks"}
            </span>
          ) : null}
        </span>
        <span className="text-[10px] tabular-nums text-sidebar-muted-foreground">
          {incomplete.length}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-0.5 border-t border-sidebar-border/60 p-1.5">
            {visible.map((task) => (
              <button
                className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-sidebar-row-hover"
                key={`${task.environmentId}:${task.id}`}
                onClick={() => void navigate({ to: "/tasks" })}
                type="button"
              >
                <span className="block truncate text-xs text-sidebar-foreground">{task.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[10px]",
                    task.dueAt && new Date(task.dueAt).getTime() < Date.now()
                      ? "text-destructive"
                      : "text-sidebar-muted-foreground",
                  )}
                >
                  {dueLabel(task.dueAt)}
                </span>
              </button>
            ))}
            {visible.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-sidebar-muted-foreground">
                You are all caught up.
              </div>
            ) : null}
            <button
              className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
              onClick={() => void navigate({ to: "/tasks" })}
              type="button"
            >
              Open all tasks
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
