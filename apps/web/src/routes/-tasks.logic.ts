import type { TaskStatus } from "@t3tools/contracts";

export function resolveTaskDropTarget(
  active: { readonly environmentId: string; readonly id: string; readonly status: TaskStatus },
  over:
    | { readonly kind: "stage"; readonly status: TaskStatus }
    | {
        readonly kind: "task";
        readonly task: {
          readonly environmentId: string;
          readonly id: string;
          readonly status: TaskStatus;
          readonly position: number;
        };
      },
  after: boolean,
): { readonly status: TaskStatus; readonly position?: number } | null {
  if (over.kind === "stage") {
    return active.status === over.status ? null : { status: over.status };
  }
  if (active.environmentId === over.task.environmentId && active.id === over.task.id) return null;
  return {
    status: over.task.status,
    position: over.task.position + (after ? 0.5 : -0.5),
  };
}
