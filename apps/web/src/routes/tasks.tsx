import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentTask } from "@t3tools/client-runtime/state/models";
import type { TaskStatus } from "@t3tools/contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CheckIcon,
  Columns3Icon,
  GripVerticalIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { isElectron } from "~/env";
import { cn, newTaskId } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { environmentTasks, taskEnvironment } from "~/state/tasks";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { SidebarInset } from "~/components/ui/sidebar";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";

const COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string; tone: string }> = [
  { status: "backlog", label: "Backlog", tone: "bg-slate-400" },
  { status: "todo", label: "Todo", tone: "bg-blue-500" },
  { status: "in_progress", label: "In progress", tone: "bg-amber-500" },
  { status: "done", label: "Done", tone: "bg-emerald-500" },
];

function orderedTasks(tasks: ReadonlyArray<EnvironmentTask>) {
  return [...tasks].sort(
    (left, right) =>
      left.position - right.position ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function TasksPage() {
  const tasks = useAtomValue(environmentTasks.tasksAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const moveTask = useAtomCommand(taskEnvironment.move, { reportFailure: false });
  const deleteTask = useAtomCommand(taskEnvironment.delete, { reportFailure: false });
  const [view, setView] = useState<"checklist" | "kanban">("checklist");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const sorted = useMemo(() => orderedTasks(tasks), [tasks]);

  const run = async (promise: ReturnType<typeof moveTask>, failureTitle: string) => {
    const result = await promise;
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: failureTitle,
          description: cause instanceof Error ? cause.message : "An error occurred.",
        }),
      );
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!primaryEnvironmentId || !title.trim() || creating) return;
    setCreating(true);
    const result = await createTask({
      environmentId: primaryEnvironmentId,
      input: {
        taskId: newTaskId(),
        title: title.trim(),
        status: "todo",
        dueAt: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
      },
    });
    setCreating(false);
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not create task",
          description: cause instanceof Error ? cause.message : "An error occurred.",
        }),
      );
      return;
    }
    setTitle("");
    setDueDate("");
  };

  const move = (task: EnvironmentTask, status: TaskStatus, position?: number) =>
    run(
      moveTask({
        environmentId: task.environmentId,
        input: {
          taskId: task.id,
          status,
          position:
            position ??
            Math.max(
              0,
              ...tasks
                .filter((entry) => entry.status === status)
                .map((entry) => entry.position + 1),
            ),
        },
      }),
      "Could not move task",
    );

  const dragged = draggedKey
    ? tasks.find((task) => `${task.environmentId}:${task.id}` === draggedKey)
    : undefined;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-auto bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1480px] px-6 pb-16 pt-[calc(var(--workspace-topbar-height)+2rem)] lg:px-10">
        <header className="flex flex-col gap-6 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
              Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Tasks</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              One task list across every connected T3 environment, available to you and permitted
              Agent Chats.
            </p>
          </div>
          <div className="inline-flex self-start rounded-lg border bg-muted/35 p-1">
            <Button
              aria-pressed={view === "checklist"}
              onClick={() => setView("checklist")}
              size="sm"
              variant={view === "checklist" ? "secondary" : "ghost"}
            >
              <ListChecksIcon className="size-4" /> Checklist
            </Button>
            <Button
              aria-pressed={view === "kanban"}
              onClick={() => setView("kanban")}
              size="sm"
              variant={view === "kanban" ? "secondary" : "ghost"}
            >
              <Columns3Icon className="size-4" /> Kanban
            </Button>
          </div>
        </header>

        <section className="my-6 grid gap-3 rounded-2xl border bg-card/70 p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_170px_auto]">
          <Input
            aria-label="Task title"
            autoFocus
            placeholder="Add a task…"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
            }}
          />
          <Input
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.currentTarget.value)}
          />
          <Button
            disabled={!primaryEnvironmentId || !title.trim() || creating}
            onClick={() => void handleCreate()}
          >
            <PlusIcon className="size-4" /> {creating ? "Adding…" : "Add task"}
          </Button>
        </section>

        {view === "checklist" ? (
          <section className="overflow-hidden rounded-2xl border bg-card/55">
            {sorted.length === 0 ? (
              <EmptyTasks />
            ) : (
              sorted.map((task) => (
                <TaskRow
                  key={`${task.environmentId}:${task.id}`}
                  task={task}
                  onComplete={() => void move(task, task.status === "done" ? "todo" : "done")}
                  onDelete={() =>
                    void run(
                      deleteTask({ environmentId: task.environmentId, input: { taskId: task.id } }),
                      "Could not delete task",
                    )
                  }
                />
              ))
            )}
          </section>
        ) : (
          <section className="grid min-w-[900px] grid-cols-4 gap-4">
            {COLUMNS.map((column) => {
              const columnTasks = sorted.filter((task) => task.status === column.status);
              return (
                <div
                  className="min-h-[360px] rounded-2xl border bg-muted/20 p-3"
                  key={column.status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragged) void move(dragged, column.status);
                    setDraggedKey(null);
                  }}
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className={cn("size-2 rounded-full", column.tone)} />
                    <h2 className="text-sm font-semibold">{column.label}</h2>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {columnTasks.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {columnTasks.map((task) => (
                      <article
                        className="cursor-grab rounded-xl border bg-card p-3 shadow-xs active:cursor-grabbing"
                        draggable
                        key={`${task.environmentId}:${task.id}`}
                        onDragStart={() => setDraggedKey(`${task.environmentId}:${task.id}`)}
                        onDragEnd={() => setDraggedKey(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          if (dragged) void move(dragged, column.status, task.position - 0.5);
                          setDraggedKey(null);
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <GripVerticalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-5">{task.title}</div>
                            <TaskMeta task={task} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </SidebarInset>
  );
}

function EmptyTasks() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <ListChecksIcon className="size-6 text-muted-foreground" />
      <h2 className="mt-4 text-sm font-semibold">Nothing on the list</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Add the first task above or let an Agent Chat create one.
      </p>
    </div>
  );
}

function TaskMeta({ task }: { task: EnvironmentTask }) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  return (
    <div
      className={cn(
        "mt-1 text-[11px] text-muted-foreground",
        due && due.getTime() < Date.now() && task.status !== "done" && "text-destructive",
      )}
    >
      {due
        ? `${due.getTime() < Date.now() && task.status !== "done" ? "Overdue · " : "Due "}${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due)}`
        : "No due date"}
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onDelete,
}: {
  task: EnvironmentTask;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex min-h-14 items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <button
        aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={cn(
          "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border",
          task.status === "done"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/45 hover:border-primary",
        )}
        onClick={onComplete}
        type="button"
      >
        {task.status === "done" ? <CheckIcon className="size-3" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-medium",
            task.status === "done" && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>
        <TaskMeta task={task} />
      </div>
      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {COLUMNS.find((column) => column.status === task.status)?.label}
      </span>
      <Button
        aria-label={`Delete ${task.title}`}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/tasks")({
  beforeLoad: () => {
    if (!isElectron) throw redirect({ to: "/" });
  },
  component: TasksPage,
});
