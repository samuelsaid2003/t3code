import {
  useDndContext,
  useDraggable,
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleDashedIcon,
  GripVerticalIcon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { cn } from "../../lib/utils";
import { useThreadDetail, useThreadShell, useThreadStatus } from "../../state/entities";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../../threadRoutes";
import { resolveThreadSyncPhase } from "../../threadSync";
import {
  shouldNavigateThreadWorkspaceRoute,
  clampThreadWorkspaceRatio,
  threadWorkspaceTargetKey,
  useThreadWorkspaceStore,
  type ThreadWorkspaceDropRegion,
  type ThreadWorkspaceLayout,
  type ThreadWorkspacePane,
} from "../../threadWorkspaceStore";
import ChatView from "../ChatView";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type {
  ThreadWorkspaceDragData,
  ThreadWorkspaceDropData,
} from "./ThreadWorkspaceDndProvider";

const FALLBACK_PANE_ID = "thread-pane-route-fallback";

function navigateToTarget(
  navigate: ReturnType<typeof useNavigate>,
  target: ThreadRouteTarget,
): void {
  if (target.kind === "server") {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(target.threadRef),
      replace: true,
    });
    return;
  }
  void navigate({
    to: "/draft/$draftId",
    params: buildDraftThreadRouteParams(target.draftId),
    replace: true,
  });
}

function WorkspacePaneTitle({ target }: { readonly target: ThreadRouteTarget }) {
  const threadShell = useThreadShell(target.kind === "server" ? target.threadRef : null);
  const draftExists = useComposerDraftStore((store) =>
    target.kind === "draft" ? store.getDraftSession(target.draftId) !== null : false,
  );
  const status = threadShell ? resolveSidebarThreadStatus(threadShell) : "ready";
  const statusLabel =
    status === "working"
      ? "Working"
      : status === "monitoring"
        ? "Monitoring"
        : status === "approval"
          ? "Approval"
          : status === "input"
            ? "Input"
            : status === "failed"
              ? "Failed"
              : null;
  const StatusIcon = status === "failed" ? CircleAlertIcon : CircleDashedIcon;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {statusLabel ? (
        <StatusIcon
          aria-label={statusLabel}
          className={cn(
            "size-3.5 shrink-0",
            status === "failed"
              ? "text-red-600 dark:text-red-400"
              : status === "approval"
                ? "text-amber-600 dark:text-amber-300"
                : status === "input"
                  ? "text-indigo-600 dark:text-indigo-300"
                  : "text-sky-600 dark:text-sky-400",
          )}
        />
      ) : (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground/35" />
      )}
      <span className="min-w-0 truncate text-xs font-medium text-foreground/90">
        {threadShell?.title ?? (draftExists ? "New thread" : "Loading thread…")}
      </span>
      {statusLabel ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{statusLabel}</span>
      ) : null}
    </div>
  );
}

function PaneHeader(props: {
  readonly pane: ThreadWorkspacePane;
  readonly focused: boolean;
  readonly maximized: boolean;
  readonly canClose: boolean;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
  readonly setNodeRef: (element: HTMLElement | null) => void;
  readonly style: CSSProperties | undefined;
  readonly onFocus: () => void;
  readonly onClose: () => void;
  readonly onToggleMaximized: () => void;
}) {
  return (
    <div
      ref={props.setNodeRef}
      style={props.style}
      {...props.attributes}
      {...props.listeners}
      onPointerDown={(event) => {
        props.onFocus();
        props.listeners?.onPointerDown?.(event);
      }}
      onDoubleClick={props.onToggleMaximized}
      className={cn(
        "flex h-8 shrink-0 cursor-grab items-center gap-1.5 border-b bg-muted/25 px-2 [-webkit-app-region:no-drag] active:cursor-grabbing",
        props.focused ? "border-border text-foreground" : "border-border/70 text-muted-foreground",
      )}
      data-testid="thread-workspace-pane-header"
    >
      <GripVerticalIcon aria-hidden className="size-3 shrink-0 opacity-35" />
      <WorkspacePaneTitle target={props.pane.target} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={props.maximized ? "Restore pane" : "Maximize pane"}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleMaximized();
              }}
            />
          }
        >
          {props.maximized ? <Minimize2Icon /> : <Maximize2Icon />}
        </TooltipTrigger>
        <TooltipPopup>{props.maximized ? "Restore pane" : "Maximize pane"}</TooltipPopup>
      </Tooltip>
      {props.canClose ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close pane"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onClose();
                }}
              />
            }
          >
            <XIcon />
          </TooltipTrigger>
          <TooltipPopup>Close pane</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ServerThreadPane(props: {
  readonly target: Extract<ThreadRouteTarget, { kind: "server" }>;
  readonly focused: boolean;
  readonly onMissing: () => void;
}) {
  const shell = useThreadShell(props.target.threadRef);
  const detail = useThreadDetail(props.target.threadRef);
  const status = useThreadStatus(props.target.threadRef);
  const missing = status === "deleted";
  useEffect(() => {
    if (missing) props.onMissing();
  }, [missing, props.onMissing]);
  if (missing || (shell === null && detail === null)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading thread…
      </div>
    );
  }
  return (
    <ChatView
      environmentId={props.target.threadRef.environmentId}
      threadId={props.target.threadRef.threadId}
      routeKind="server"
      threadSyncPhase={resolveThreadSyncPhase({
        detailExists: detail !== null,
        shellExists: shell !== null,
        status,
      })}
      workspacePane
      workspaceFocused={props.focused}
    />
  );
}

function DraftThreadPane(props: {
  readonly target: Extract<ThreadRouteTarget, { kind: "draft" }>;
  readonly focused: boolean;
  readonly onMissing: () => void;
}) {
  const draftSession = useComposerDraftStore((store) =>
    store.getDraftSession(props.target.draftId),
  );
  useEffect(() => {
    if (draftSession === null) props.onMissing();
  }, [draftSession, props.onMissing]);
  if (draftSession === null) return null;
  return (
    <ChatView
      draftId={props.target.draftId}
      environmentId={draftSession.environmentId}
      threadId={draftSession.threadId}
      routeKind="draft"
      workspacePane
      workspaceFocused={props.focused}
    />
  );
}

function ThreadTargetPane(props: {
  readonly target: ThreadRouteTarget;
  readonly focused: boolean;
  readonly onMissing: () => void;
}) {
  return props.target.kind === "server" ? (
    <ServerThreadPane target={props.target} focused={props.focused} onMissing={props.onMissing} />
  ) : (
    <DraftThreadPane target={props.target} focused={props.focused} onMissing={props.onMissing} />
  );
}

const ThreadPaneFrame = memo(function ThreadPaneFrame(props: {
  readonly pane: ThreadWorkspacePane;
  readonly focused: boolean;
  readonly maximized: boolean;
  readonly canClose: boolean;
}) {
  const focusPane = useThreadWorkspaceStore((state) => state.focusPane);
  const closePane = useThreadWorkspaceStore((state) => state.closePane);
  const toggleMaximizedPane = useThreadWorkspaceStore((state) => state.toggleMaximizedPane);
  const draggable = useDraggable({
    id: `workspace-pane-drag:${props.pane.id}`,
    data: { type: "workspace-pane", paneId: props.pane.id } satisfies ThreadWorkspaceDragData,
  });
  const droppable = useDroppable({
    id: `workspace-pane-drop:${props.pane.id}`,
    data: {
      type: "workspace-pane-target",
      paneId: props.pane.id,
    } satisfies ThreadWorkspaceDropData,
  });
  const focus = useCallback(() => focusPane(props.pane.id), [focusPane, props.pane.id]);
  const close = useCallback(() => closePane(props.pane.id), [closePane, props.pane.id]);
  const toggleMaximized = useCallback(
    () => toggleMaximizedPane(props.pane.id),
    [props.pane.id, toggleMaximizedPane],
  );
  return (
    <section
      ref={droppable.setNodeRef}
      onPointerDownCapture={focus}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden border-border bg-background",
        props.focused && "ring-1 ring-inset ring-foreground/15",
        droppable.isOver && "ring-2 ring-inset ring-primary/60",
      )}
      data-testid="thread-workspace-pane"
      data-focused={props.focused ? "true" : "false"}
    >
      <PaneHeader
        pane={props.pane}
        focused={props.focused}
        maximized={props.maximized}
        canClose={props.canClose}
        attributes={draggable.attributes}
        listeners={draggable.listeners}
        setNodeRef={draggable.setNodeRef}
        style={
          draggable.transform
            ? { transform: CSS.Translate.toString(draggable.transform) }
            : undefined
        }
        onFocus={focus}
        onClose={close}
        onToggleMaximized={toggleMaximized}
      />
      <ThreadTargetPane target={props.pane.target} focused={props.focused} onMissing={close} />
    </section>
  );
});

function EdgeDropZone({ region }: { readonly region: ThreadWorkspaceDropRegion }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `workspace-edge:${region}`,
    data: { type: "workspace-edge", region } satisfies ThreadWorkspaceDropData,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute z-40 flex items-center justify-center rounded-lg border border-primary/30 bg-primary/8 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm transition-colors",
        region === "left" && "bottom-1/4 left-2 top-1/4 w-20",
        region === "right" && "bottom-1/4 right-2 top-1/4 w-20",
        region === "top" && "left-1/4 right-1/4 top-2 h-16",
        region === "bottom" && "bottom-2 left-1/4 right-1/4 h-16",
        isOver && "border-primary bg-primary/20",
      )}
    >
      Split {region}
    </div>
  );
}

function WorkspaceDropOverlay() {
  const { active } = useDndContext();
  const dragData = active?.data.current as ThreadWorkspaceDragData | undefined;
  if (dragData?.type !== "workspace-thread") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className="pointer-events-auto contents">
        <EdgeDropZone region="left" />
        <EdgeDropZone region="right" />
        <EdgeDropZone region="top" />
        <EdgeDropZone region="bottom" />
      </div>
    </div>
  );
}

function EmptyGridSlot() {
  const { active } = useDndContext();
  const dragData = active?.data.current as ThreadWorkspaceDragData | undefined;
  const { setNodeRef, isOver } = useDroppable({
    id: "workspace-edge:empty-grid-slot",
    data: { type: "workspace-empty-slot" } satisfies ThreadWorkspaceDropData,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 items-center justify-center border border-dashed border-border/70 bg-muted/10 text-xs text-muted-foreground",
        dragData?.type === "workspace-thread" && "border-primary/40 text-primary/80",
        isOver && "bg-primary/10",
      )}
    >
      Drag a thread here
    </div>
  );
}

function layoutStyle(layout: ThreadWorkspaceLayout): CSSProperties {
  if (layout === "columns") {
    return {
      gridTemplateColumns:
        "var(--thread-workspace-column-ratio) calc(100% - var(--thread-workspace-column-ratio))",
    };
  }
  if (layout === "rows") {
    return {
      gridTemplateRows:
        "var(--thread-workspace-row-ratio) calc(100% - var(--thread-workspace-row-ratio))",
    };
  }
  if (layout === "grid") {
    return {
      gridTemplateColumns:
        "var(--thread-workspace-column-ratio) calc(100% - var(--thread-workspace-column-ratio))",
      gridTemplateRows:
        "var(--thread-workspace-row-ratio) calc(100% - var(--thread-workspace-row-ratio))",
    };
  }
  return { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" };
}

function ResizeRail(props: {
  readonly axis: "column" | "row";
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const setColumnRatio = useThreadWorkspaceStore((state) => state.setColumnRatio);
  const setRowRatio = useThreadWorkspaceStore((state) => state.setRowRatio);
  const setRatio = props.axis === "column" ? setColumnRatio : setRowRatio;
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const container = props.containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let committedRatio =
      props.axis === "column"
        ? useThreadWorkspaceStore.getState().columnRatio
        : useThreadWorkspaceStore.getState().rowRatio;
    const move = (pointerEvent: PointerEvent) => {
      committedRatio = clampThreadWorkspaceRatio(
        props.axis === "column"
          ? ((pointerEvent.clientX - rect.left) / rect.width) * 100
          : ((pointerEvent.clientY - rect.top) / rect.height) * 100,
      );
      container.style.setProperty(
        props.axis === "column"
          ? "--thread-workspace-column-ratio"
          : "--thread-workspace-row-ratio",
        `${committedRatio}%`,
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setRatio(committedRatio);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return (
    <button
      type="button"
      aria-label={props.axis === "column" ? "Resize thread columns" : "Resize thread rows"}
      onPointerDown={beginResize}
      onDoubleClick={() => {
        props.containerRef.current?.style.setProperty(
          props.axis === "column"
            ? "--thread-workspace-column-ratio"
            : "--thread-workspace-row-ratio",
          "50%",
        );
        setRatio(50);
      }}
      className={cn(
        "group absolute z-30 block border-0 bg-transparent p-0 outline-none [-webkit-app-region:no-drag]",
        props.axis === "column"
          ? "bottom-0 top-0 w-2 -translate-x-1/2 cursor-col-resize"
          : "left-0 right-0 h-2 -translate-y-1/2 cursor-row-resize",
      )}
      style={
        props.axis === "column"
          ? { left: "var(--thread-workspace-column-ratio)" }
          : { top: "var(--thread-workspace-row-ratio)" }
      }
    >
      <span
        className={cn(
          "absolute bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary/60",
          props.axis === "column" ? "bottom-0 left-1/2 top-0 w-px" : "left-0 right-0 top-1/2 h-px",
        )}
      />
    </button>
  );
}

export function ThreadWorkspace({ routeTarget }: { readonly routeTarget: ThreadRouteTarget }) {
  const navigate = useNavigate();
  const panes = useThreadWorkspaceStore((state) => state.panes);
  const focusedPaneId = useThreadWorkspaceStore((state) => state.focusedPaneId);
  const layout = useThreadWorkspaceStore((state) => state.layout);
  const columnRatio = useThreadWorkspaceStore((state) => state.columnRatio);
  const rowRatio = useThreadWorkspaceStore((state) => state.rowRatio);
  const maximizedPaneId = useThreadWorkspaceStore((state) => state.maximizedPaneId);
  const syncRouteTarget = useThreadWorkspaceStore((state) => state.syncRouteTarget);
  const containerRef = useRef<HTMLDivElement>(null);
  const routeTargetRef = useRef(routeTarget);
  const pendingRouteTargetKeyRef = useRef<string | null>(null);
  const routeTargetKey = threadWorkspaceTargetKey(routeTarget);
  routeTargetRef.current = routeTarget;

  useLayoutEffect(() => {
    pendingRouteTargetKeyRef.current = routeTargetKey;
    syncRouteTarget(routeTargetRef.current);
  }, [routeTargetKey, syncRouteTarget]);

  const fallbackPane = useMemo<ThreadWorkspacePane>(
    () => ({ id: FALLBACK_PANE_ID, target: routeTarget }),
    [routeTarget, routeTargetKey],
  );
  const renderedPanes = panes.length === 0 ? [fallbackPane] : panes;
  const effectiveFocusedPaneId = focusedPaneId ?? renderedPanes[0]?.id ?? null;
  const focusedPane = renderedPanes.find((pane) => pane.id === effectiveFocusedPaneId) ?? null;
  const focusedTargetKey = focusedPane ? threadWorkspaceTargetKey(focusedPane.target) : null;

  useLayoutEffect(() => {
    if (
      focusedTargetKey === routeTargetKey &&
      pendingRouteTargetKeyRef.current === routeTargetKey
    ) {
      pendingRouteTargetKeyRef.current = null;
    }
  }, [focusedTargetKey, routeTargetKey]);

  useEffect(() => {
    if (!focusedPane) return;
    if (
      !shouldNavigateThreadWorkspaceRoute({
        focusedTargetKey,
        routeTargetKey,
        pendingRouteTargetKey: pendingRouteTargetKeyRef.current,
      })
    ) {
      return;
    }
    navigateToTarget(navigate, focusedPane.target);
  }, [focusedPane, focusedTargetKey, navigate, routeTargetKey]);

  const visiblePanes = maximizedPaneId
    ? renderedPanes.filter((pane) => pane.id === maximizedPaneId)
    : renderedPanes;
  const effectiveLayout = maximizedPaneId ? "single" : layout;
  const showGridPlaceholder = effectiveLayout === "grid" && visiblePanes.length === 3;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
      style={
        {
          "--thread-workspace-column-ratio": `${columnRatio}%`,
          "--thread-workspace-row-ratio": `${rowRatio}%`,
        } as CSSProperties
      }
    >
      <div
        className="grid min-h-0 min-w-0 flex-1 gap-px bg-border"
        style={layoutStyle(effectiveLayout)}
        data-testid="thread-workspace"
        data-layout={effectiveLayout}
      >
        {visiblePanes.map((pane) => (
          <ThreadPaneFrame
            key={pane.id}
            pane={pane}
            focused={pane.id === effectiveFocusedPaneId}
            maximized={pane.id === maximizedPaneId}
            canClose={renderedPanes.length > 1}
          />
        ))}
        {showGridPlaceholder ? <EmptyGridSlot /> : null}
      </div>
      {!maximizedPaneId && (layout === "columns" || layout === "grid") ? (
        <ResizeRail axis="column" containerRef={containerRef} />
      ) : null}
      {!maximizedPaneId && (layout === "rows" || layout === "grid") ? (
        <ResizeRail axis="row" containerRef={containerRef} />
      ) : null}
      <WorkspaceDropOverlay />
    </div>
  );
}
