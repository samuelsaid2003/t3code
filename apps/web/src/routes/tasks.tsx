import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentTask } from "@t3tools/client-runtime/state/models";
import type { TaskStatus } from "@t3tools/contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  Columns3Icon,
  GripVerticalIcon,
  LayoutListIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { isElectron } from "~/env";
import { cn, newTaskId } from "~/lib/utils";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { environmentTasks, taskEnvironment } from "~/state/tasks";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarInset } from "~/components/ui/sidebar";
import { Textarea } from "~/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";

type TaskView = "list" | "board";
type TaskScope = "all" | "active" | "backlog";

const STATUS_OPTIONS: ReadonlyArray<{
  status: TaskStatus;
  label: string;
  icon: typeof CircleIcon;
  iconClassName: string;
}> = [
  {
    status: "backlog",
    label: "Backlog",
    icon: CircleDashedIcon,
    iconClassName: "text-muted-foreground",
  },
  { status: "todo", label: "Todo", icon: CircleIcon, iconClassName: "text-blue-500" },
  {
    status: "in_progress",
    label: "In progress",
    icon: CircleDotIcon,
    iconClassName: "text-amber-500",
  },
  { status: "done", label: "Done", icon: CheckCircle2Icon, iconClassName: "text-emerald-500" },
];

const GROUP_ORDER: ReadonlyArray<TaskStatus> = ["in_progress", "todo", "backlog", "done"];

function statusOption(status: TaskStatus) {
  return STATUS_OPTIONS.find((option) => option.status === status) ?? STATUS_OPTIONS[0]!;
}

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
  const { environments } = useEnvironments();
  const projects = useProjects();
  const threads = useThreadShells();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const moveTask = useAtomCommand(taskEnvironment.move, { reportFailure: false });
  const deleteTask = useAtomCommand(taskEnvironment.delete, { reportFailure: false });
  const [view, setView] = useState<TaskView>("list");
  const [scope, setScope] = useState<TaskScope>("all");
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [createStatus, setCreateStatus] = useState<TaskStatus>("todo");
  const [creating, setCreating] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  const environmentLabels = useMemo(
    () =>
      new Map(environments.map((environment) => [environment.environmentId, environment.label])),
    [environments],
  );
  const projectTitles = useMemo(
    () =>
      new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project.title])),
    [projects],
  );
  const threadTitles = useMemo(
    () => new Map(threads.map((thread) => [`${thread.environmentId}:${thread.id}`, thread.title])),
    [threads],
  );

  const sorted = useMemo(() => orderedTasks(tasks), [tasks]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTasks = useMemo(
    () =>
      sorted.filter((task) => {
        if (scope === "active" && !["todo", "in_progress"].includes(task.status)) return false;
        if (scope === "backlog" && task.status !== "backlog") return false;
        if (!normalizedQuery) return true;
        return `${task.title} ${task.notes ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
      }),
    [normalizedQuery, scope, sorted],
  );
  const openCount = tasks.filter((task) => task.status !== "done").length;

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

  const resetComposer = () => {
    setTitle("");
    setNotes("");
    setDueDate("");
    setCreateStatus("todo");
    setIsAdding(false);
  };

  const openComposer = (status: TaskStatus = "todo") => {
    setCreateStatus(status);
    setIsAdding(true);
  };

  const handleCreate = async () => {
    if (!primaryEnvironmentId || !title.trim() || creating) return;
    setCreating(true);
    const result = await createTask({
      environmentId: primaryEnvironmentId,
      input: {
        taskId: newTaskId(),
        title: title.trim(),
        notes: notes.trim() || null,
        status: createStatus,
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
    resetComposer();
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

  const taskContext = (task: EnvironmentTask) => ({
    environment: environmentLabels.get(task.environmentId) ?? "Environment",
    project: task.projectId
      ? (projectTitles.get(`${task.environmentId}:${task.projectId}`) ?? null)
      : null,
    thread: task.threadId
      ? (threadTitles.get(`${task.environmentId}:${task.threadId}`) ?? null)
      : null,
  });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <main className="flex h-full min-h-0 flex-col pt-(--workspace-topbar-height)">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-5">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold">All tasks</h1>
            <span className="text-[11px] tabular-nums text-muted-foreground">{openCount} open</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <InputGroup className="hidden h-7 w-52 sm:flex" data-size="sm">
              <InputGroupAddon>
                <SearchIcon className="size-3.5" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <Button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    size="icon-micro"
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <Button onClick={() => openComposer()} size="sm">
              <PlusIcon /> New task
            </Button>
          </div>
        </header>

        <div className="flex min-h-10 shrink-0 items-end border-b px-4 lg:px-5">
          <nav aria-label="Task views" className="flex h-full items-end gap-5">
            {(
              [
                ["all", "All tasks"],
                ["active", "Active"],
                ["backlog", "Backlog"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-current={scope === value ? "page" : undefined}
                className={cn(
                  "relative h-full cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground",
                  scope === value &&
                    "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground",
                )}
                key={value}
                onClick={() => setScope(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
          <ToggleGroup
            aria-label="Task display"
            className="ml-auto mb-1.5"
            onValueChange={(value) => value[0] && setView(value[0] as TaskView)}
            value={[view]}
            variant="segmented"
          >
            <ToggleGroupItem aria-label="List view" size="sm" value="list">
              <LayoutListIcon />
            </ToggleGroupItem>
            <ToggleGroupItem aria-label="Board view" size="sm" value="board">
              <Columns3Icon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {view === "list" ? (
            <TaskList
              dragged={dragged}
              onDelete={(task) =>
                void run(
                  deleteTask({ environmentId: task.environmentId, input: { taskId: task.id } }),
                  "Could not delete task",
                )
              }
              onDragEnd={() => setDraggedKey(null)}
              onDragStart={(task) => setDraggedKey(`${task.environmentId}:${task.id}`)}
              onMove={(task, status, position) => void move(task, status, position)}
              onNewTask={openComposer}
              taskContext={taskContext}
              tasks={visibleTasks}
            />
          ) : (
            <TaskBoard
              dragged={dragged}
              onDragEnd={() => setDraggedKey(null)}
              onDragStart={(task) => setDraggedKey(`${task.environmentId}:${task.id}`)}
              onMove={(task, status, position) => void move(task, status, position)}
              onNewTask={openComposer}
              taskContext={taskContext}
              tasks={visibleTasks}
            />
          )}
        </div>
      </main>

      <NewTaskDialog
        creating={creating}
        dueDate={dueDate}
        notes={notes}
        onCreate={() => void handleCreate()}
        onDueDateChange={setDueDate}
        onNotesChange={setNotes}
        onOpenChange={(open) => (open ? setIsAdding(true) : resetComposer())}
        onStatusChange={setCreateStatus}
        onTitleChange={setTitle}
        open={isAdding}
        status={createStatus}
        title={title}
      />
    </SidebarInset>
  );
}

function NewTaskDialog({
  open,
  title,
  notes,
  dueDate,
  status,
  creating,
  onOpenChange,
  onTitleChange,
  onNotesChange,
  onDueDateChange,
  onStatusChange,
  onCreate,
}: {
  open: boolean;
  title: string;
  notes: string;
  dueDate: string;
  status: TaskStatus;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onStatusChange: (value: TaskStatus) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="max-w-xl" showCloseButton={false}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">New task</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-3 pt-1" scrollFade={false}>
          <input
            aria-label="Task title"
            autoFocus
            className="w-full bg-transparent text-lg font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/55"
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onCreate();
            }}
            placeholder="Task title"
            value={title}
          />
          <Textarea
            aria-label="Task notes"
            className="min-h-24 border-transparent bg-muted/25 shadow-none focus-within:border-input focus-within:ring-0 dark:bg-muted/20"
            onChange={(event) => onNotesChange(event.currentTarget.value)}
            placeholder="Add description or notes…"
            value={notes}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <TaskStatusSelect onChange={onStatusChange} status={status} variant="outline" />
            <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-xs/5 hover:bg-accent/50 dark:bg-input/32">
              <CalendarDaysIcon className="size-3.5" />
              <span>
                {dueDate
                  ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
                      new Date(`${dueDate}T12:00:00`),
                    )
                  : "Due date"}
              </span>
              <input
                aria-label="Due date"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => onDueDateChange(event.currentTarget.value)}
                type="date"
                value={dueDate}
              />
            </label>
          </div>
        </DialogPanel>
        <DialogFooter className="items-center sm:justify-between" variant="bare">
          <span className="hidden text-[11px] text-muted-foreground sm:block">
            ⌘ Enter to create
          </span>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!title.trim() || creating} onClick={onCreate} size="sm">
              {creating ? "Creating…" : "Create task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

interface TaskContext {
  environment: string;
  project: string | null;
  thread: string | null;
}

interface TaskSurfaceProps {
  tasks: ReadonlyArray<EnvironmentTask>;
  dragged: EnvironmentTask | undefined;
  taskContext: (task: EnvironmentTask) => TaskContext;
  onMove: (task: EnvironmentTask, status: TaskStatus, position?: number) => void;
  onNewTask: (status?: TaskStatus) => void;
  onDragStart: (task: EnvironmentTask) => void;
  onDragEnd: () => void;
}

function TaskList({
  tasks,
  dragged,
  taskContext,
  onMove,
  onDelete,
  onNewTask,
  onDragStart,
  onDragEnd,
}: TaskSurfaceProps & { onDelete: (task: EnvironmentTask) => void }) {
  if (tasks.length === 0) return <EmptyTasks onNewTask={() => onNewTask()} />;

  return (
    <div className="min-w-[760px] pb-12">
      {GROUP_ORDER.map((status) => {
        const groupTasks = tasks.filter((task) => task.status === status);
        if (groupTasks.length === 0) return null;
        const option = statusOption(status);
        return (
          <section key={status}>
            <div className="group/header flex h-8 items-center gap-2 border-b bg-muted/35 px-4 text-xs font-medium">
              <span>{option.label}</span>
              <span className="font-normal tabular-nums text-muted-foreground">
                {groupTasks.length}
              </span>
              <button
                aria-label={`Add ${option.label.toLowerCase()} task`}
                className="ml-auto flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100 focus-visible:opacity-100"
                onClick={() => onNewTask(status)}
                type="button"
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>
            {groupTasks.map((task) => (
              <TaskListRow
                dragged={dragged}
                key={`${task.environmentId}:${task.id}`}
                onDelete={() => onDelete(task)}
                onDragEnd={onDragEnd}
                onDragStart={() => onDragStart(task)}
                onMove={(nextStatus, position) => onMove(task, nextStatus, position)}
                task={task}
                taskContext={taskContext(task)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function TaskListRow({
  task,
  dragged,
  taskContext,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: EnvironmentTask;
  dragged: EnvironmentTask | undefined;
  taskContext: TaskContext;
  onMove: (status: TaskStatus, position?: number) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className="group flex h-9 items-center gap-2 border-b px-3 text-xs transition-colors hover:bg-muted/30"
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDrop={(event) => {
        event.preventDefault();
        if (dragged && dragged.id !== task.id) onMove(task.status, task.position - 0.5);
        onDragEnd();
      }}
    >
      <GripVerticalIcon className="size-3.5 shrink-0 cursor-grab text-muted-foreground/0 group-hover:text-muted-foreground/60 active:cursor-grabbing" />
      <TaskStatusSelect onChange={(status) => onMove(status)} status={task.status} />
      <span className="w-15 shrink-0 font-mono text-[10px] text-muted-foreground/55">
        T-{task.id.slice(-4).toUpperCase()}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px] font-medium",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.notes ? (
        <span className="hidden max-w-56 truncate text-[11px] text-muted-foreground 2xl:block">
          {task.notes}
        </span>
      ) : null}
      <TaskContextPill context={taskContext} />
      <TaskDueDate task={task} />
      <Menu>
        <MenuTrigger
          aria-label={`Actions for ${task.title}`}
          render={
            <Button
              className="opacity-0 group-hover:opacity-100 data-pressed:opacity-100"
              size="icon-micro"
              variant="ghost"
            />
          }
        >
          <MoreHorizontalIcon />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom">
          <MenuItem onClick={onDelete} variant="destructive">
            <Trash2Icon /> Delete task
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function TaskStatusSelect({
  status,
  onChange,
  variant = "ghost",
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  variant?: "ghost" | "outline";
}) {
  const option = statusOption(status);
  const StatusIcon = option.icon;
  return (
    <Select value={status} onValueChange={(value) => value && onChange(value as TaskStatus)}>
      <SelectTrigger
        aria-label={`Status: ${option.label}`}
        className={cn(
          "h-6 min-w-0 gap-1.5 px-1.5 text-xs shadow-none [&_[data-slot=select-icon]]:hidden",
          variant === "ghost" &&
            "w-7 border-transparent bg-transparent hover:bg-accent dark:bg-transparent",
          variant === "outline" && "w-auto",
        )}
        size="compact"
      >
        <StatusIcon className={cn("size-3.5", option.iconClassName)} />
        {variant === "outline" ? <SelectValue /> : null}
      </SelectTrigger>
      <SelectPopup align="start" alignItemWithTrigger={false}>
        {STATUS_OPTIONS.map((entry) => (
          <SelectItem key={entry.status} value={entry.status}>
            <entry.icon className={entry.iconClassName} /> {entry.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function TaskContextPill({ context }: { context: TaskContext }) {
  return (
    <span className="hidden max-w-44 items-center gap-1 rounded-sm border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline-flex">
      <ServerIcon className="size-2.5 shrink-0" />
      <span className="truncate">{context.project ?? context.environment}</span>
      {context.thread ? <span className="truncate opacity-60">/ {context.thread}</span> : null}
    </span>
  );
}

function TaskDueDate({ task }: { task: EnvironmentTask }) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const overdue = due.getTime() < Date.now() && task.status !== "done";
  return (
    <span
      className={cn(
        "inline-flex w-16 shrink-0 items-center justify-end gap-1 text-[10px] text-muted-foreground",
        overdue && "font-medium text-destructive",
      )}
    >
      <CalendarDaysIcon className="size-2.5" />
      {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due)}
    </span>
  );
}

function TaskBoard({
  tasks,
  dragged,
  taskContext,
  onMove,
  onNewTask,
  onDragStart,
  onDragEnd,
}: TaskSurfaceProps) {
  if (tasks.length === 0) return <EmptyTasks onNewTask={() => onNewTask()} />;
  return (
    <div className="grid min-w-[900px] grid-cols-4 gap-px bg-border pb-12">
      {STATUS_OPTIONS.map((option) => {
        const columnTasks = tasks.filter((task) => task.status === option.status);
        const StatusIcon = option.icon;
        return (
          <section
            className="min-h-[calc(100dvh-var(--workspace-topbar-height)-6rem)] bg-background"
            key={option.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragged) onMove(dragged, option.status);
              onDragEnd();
            }}
          >
            <header className="flex h-9 items-center gap-2 border-b px-3">
              <StatusIcon className={cn("size-3.5", option.iconClassName)} />
              <span className="text-xs font-medium">{option.label}</span>
              <Badge className="ml-0.5" size="sm" variant="secondary">
                {columnTasks.length}
              </Badge>
              <Button
                aria-label={`Add ${option.label.toLowerCase()} task`}
                className="ml-auto"
                onClick={() => onNewTask(option.status)}
                size="icon-micro"
                variant="ghost"
              >
                <PlusIcon />
              </Button>
            </header>
            <div className="space-y-2 bg-muted/10 p-2">
              {columnTasks.map((task) => {
                const context = taskContext(task);
                return (
                  <article
                    className="cursor-grab rounded-md border bg-card px-3 py-2.5 shadow-xs transition-colors hover:border-foreground/20 active:cursor-grabbing"
                    draggable
                    key={`${task.environmentId}:${task.id}`}
                    onDragEnd={onDragEnd}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => onDragStart(task)}
                    onDrop={(event) => {
                      event.stopPropagation();
                      if (dragged) onMove(dragged, option.status, task.position - 0.5);
                      onDragEnd();
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <StatusIcon className={cn("size-3", option.iconClassName)} />
                      T-{task.id.slice(-4).toUpperCase()}
                    </div>
                    <div className="mt-1.5 text-[12px] font-medium leading-5">{task.title}</div>
                    {task.notes ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                        {task.notes}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2 border-t pt-2">
                      <TaskDueDate task={task} />
                      <span className="ml-auto max-w-28 truncate text-[10px] text-muted-foreground">
                        {context.project ?? context.environment}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyTasks({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <div className="flex size-9 items-center justify-center rounded-lg border bg-card shadow-xs">
        <LayoutListIcon className="size-4 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-semibold">No tasks in this view</h2>
      <p className="mt-1 text-xs text-muted-foreground">Change the view or create a new task.</p>
      <Button className="mt-4" onClick={onNewTask} size="sm" variant="outline">
        <PlusIcon /> New task
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
