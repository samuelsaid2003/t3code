import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { ReactNode } from "react";

import type { ThreadRouteTarget } from "../../threadRoutes";
import {
  THREAD_WORKSPACE_MAX_PANES,
  useThreadWorkspaceStore,
  type ThreadWorkspaceDropRegion,
} from "../../threadWorkspaceStore";
import { toastManager } from "../ui/toast";

export type ThreadWorkspaceDragData =
  | {
      readonly type: "workspace-thread";
      readonly target: ThreadRouteTarget;
      readonly label?: string;
      readonly pinnedSortable?: boolean;
    }
  | {
      readonly type: "workspace-pane";
      readonly paneId: string;
    };

export type ThreadWorkspaceDropData =
  | {
      readonly type: "workspace-edge";
      readonly region: ThreadWorkspaceDropRegion;
    }
  | {
      readonly type: "workspace-pane-target";
      readonly paneId: string;
    }
  | {
      readonly type: "workspace-empty-slot";
    };

export const workspaceCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const workspaceCollision =
    pointerCollisions.find(
      (collision) =>
        collision.data?.droppableContainer.data.current?.type === "workspace-empty-slot",
    ) ??
    pointerCollisions.find(
      (collision) => collision.data?.droppableContainer.data.current?.type === "workspace-edge",
    ) ??
    pointerCollisions.find(
      (collision) =>
        collision.data?.droppableContainer.data.current?.type === "workspace-pane-target",
    );
  if (workspaceCollision) {
    return [workspaceCollision];
  }

  const activeData = args.active.data.current as ThreadWorkspaceDragData | undefined;
  if (activeData?.type !== "workspace-thread" || activeData.pinnedSortable !== true) {
    // A workspace drop is pointer-driven. Returning an empty result when the
    // pointer is over nothing is what makes cancelling a sloppy drag safe.
    return pointerCollisions;
  }

  // Pinned reorder still needs nearest-row collision while the pointer sits
  // between cards, but it must not choose a workspace target from a distance.
  const pinnedContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as ThreadWorkspaceDragData | undefined;
    return data?.type === "workspace-thread" && data.pinnedSortable === true;
  });
  return closestCenter({ ...args, droppableContainers: pinnedContainers });
};

export function handleWorkspaceDragEnd(event: DragEndEvent): void {
  const dragData = event.active.data.current as ThreadWorkspaceDragData | undefined;
  const dropData = event.over?.data.current as
    | ThreadWorkspaceDropData
    | ThreadWorkspaceDragData
    | undefined;
  if (!dragData || !dropData) return;

  const store = useThreadWorkspaceStore.getState();
  if (dragData.type === "workspace-pane") {
    if (dropData.type === "workspace-pane-target") {
      store.swapPanes(dragData.paneId, dropData.paneId);
    } else if (dropData.type === "workspace-empty-slot") {
      store.movePaneToEnd(dragData.paneId);
    }
    return;
  }

  if (dropData.type === "workspace-empty-slot") {
    store.addTarget(dragData.target, "bottom");
    return;
  }

  if (dropData.type === "workspace-pane-target") {
    store.replacePaneTarget(dropData.paneId, dragData.target);
    return;
  }

  if (dropData.type !== "workspace-edge") {
    return;
  }

  if (!store.addTarget(dragData.target, dropData.region)) {
    toastManager.add({
      type: "info",
      title: `Maximum ${THREAD_WORKSPACE_MAX_PANES} panes`,
      description: "Close a pane or drop the thread onto an existing pane to replace its view.",
    });
  }
}

function ThreadWorkspaceDragOverlay() {
  const { active } = useDndContext();
  const dragData = active?.data.current as ThreadWorkspaceDragData | undefined;
  if (dragData?.type !== "workspace-thread") {
    return null;
  }

  return (
    <div className="max-w-72 truncate rounded-md border border-border bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-xl">
      {dragData.label ?? "Thread"}
    </div>
  );
}

export function ThreadWorkspaceDndProvider({ children }: { readonly children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={workspaceCollisionDetection}
      onDragEnd={handleWorkspaceDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        <ThreadWorkspaceDragOverlay />
      </DragOverlay>
    </DndContext>
  );
}
