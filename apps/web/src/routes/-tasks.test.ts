import { describe, expect, it } from "vite-plus/test";

import { resolveTaskDropTarget } from "./-tasks.logic";

const active = {
  environmentId: "env-1",
  id: "task-active",
  status: "todo",
} as const;

describe("resolveTaskDropTarget", () => {
  it("moves the dragged task into an empty stage", () => {
    expect(resolveTaskDropTarget(active, { kind: "stage", status: "in_progress" }, false)).toEqual({
      status: "in_progress",
    });
  });

  it("positions the dragged task around the row it was dropped on", () => {
    const over = {
      kind: "task",
      task: {
        environmentId: "env-1",
        id: "task-target",
        status: "backlog",
        position: 10,
      },
    } as const;

    expect(resolveTaskDropTarget(active, over, false)).toEqual({
      status: "backlog",
      position: 9.5,
    });
    expect(resolveTaskDropTarget(active, over, true)).toEqual({
      status: "backlog",
      position: 10.5,
    });
  });

  it("does not move a task when it is dropped on itself or its current empty stage", () => {
    expect(
      resolveTaskDropTarget(
        active,
        {
          kind: "task",
          task: { ...active, position: 4 },
        },
        false,
      ),
    ).toBeNull();
    expect(resolveTaskDropTarget(active, { kind: "stage", status: "todo" }, false)).toBeNull();
  });
});
