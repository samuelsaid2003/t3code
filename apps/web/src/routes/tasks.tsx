import { autoAnimate } from "@formkit/auto-animate";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { isElectron } from "~/env";
import { cn, newTaskId } from "~/lib/utils";
import { useProjects, useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { environmentTasks, taskEnvironment } from "~/state/tasks";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
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
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
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

import { resolveTaskDropTarget } from "./-tasks.logic";

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

function taskKey(task: EnvironmentTask) {
  return `${task.environmentId}:${task.id}`;
}

function taskDragId(task: EnvironmentTask) {
  return `task:${taskKey(task)}`;
}

function taskStageDragId(status: TaskStatus) {
  return `task-stage:${status}`;
}

function dueDateValue(task: EnvironmentTask): Date | undefined {
  if (!task.dueAt) return undefined;
  const value = new Date(task.dueAt);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function dueAtValue(date: Date | undefined): string | null {
  if (!date) return null;
  const value = new Date(date);
  value.setHours(17, 0, 0, 0);
  return value.toISOString();
}

function TasksPage() {
  const tasks = useAtomValue(environmentTasks.tasksAtom);
  const projects = useProjects();
  const threads = useThreadShells();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const updateTask = useAtomCommand(taskEnvironment.update, { reportFailure: false });
  const moveTask = useAtomCommand(taskEnvironment.move, { reportFailure: false });
  const deleteTask = useAtomCommand(taskEnvironment.delete, { reportFailure: false });
  const [view, setView] = useState<TaskView>("list");
  const [scope, setScope] = useState<TaskScope>("all");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [editorStatus, setEditorStatus] = useState<TaskStatus>("todo");
  const [saving, setSaving] = useState(false);

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
  const editingTask =
    editingTaskKey === null ? undefined : tasks.find((task) => taskKey(task) === editingTaskKey);

  const showFailure = (failure: unknown, titleText: string) => {
    const cause = squashAtomCommandFailure(failure as never);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: titleText,
        description: cause instanceof Error ? cause.message : "An error occurred.",
      }),
    );
  };

  const resetEditor = () => {
    setEditorOpen(false);
    setEditingTaskKey(null);
    setTitle("");
    setNotes("");
    setDueDate(undefined);
    setEditorStatus("todo");
  };

  const openCreate = (status: TaskStatus = "todo") => {
    setEditingTaskKey(null);
    setTitle("");
    setNotes("");
    setDueDate(undefined);
    setEditorStatus(status);
    setEditorOpen(true);
  };

  const openEdit = (task: EnvironmentTask) => {
    setEditingTaskKey(taskKey(task));
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueDate(dueDateValue(task));
    setEditorStatus(task.status);
    setEditorOpen(true);
  };

  const move = useCallback(
    async (task: EnvironmentTask, status: TaskStatus, position?: number) => {
      const result = await moveTask({
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
      });
      if (result._tag === "Failure") {
        showFailure(result, "Could not move task");
        return false;
      }
      return true;
    },
    [moveTask, tasks],
  );

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);

    if (editingTask) {
      const updateResult = await updateTask({
        environmentId: editingTask.environmentId,
        input: {
          taskId: editingTask.id,
          title: title.trim(),
          notes: notes.trim() || null,
          dueAt: dueAtValue(dueDate),
        },
      });
      if (updateResult._tag === "Failure") {
        setSaving(false);
        showFailure(updateResult, "Could not update task");
        return;
      }
      if (editingTask.status !== editorStatus) {
        const moved = await move(editingTask, editorStatus);
        if (!moved) {
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      resetEditor();
      return;
    }

    if (!primaryEnvironmentId) {
      setSaving(false);
      return;
    }
    const createResult = await createTask({
      environmentId: primaryEnvironmentId,
      input: {
        taskId: newTaskId(),
        title: title.trim(),
        notes: notes.trim() || null,
        status: editorStatus,
        dueAt: dueAtValue(dueDate),
      },
    });
    setSaving(false);
    if (createResult._tag === "Failure") {
      showFailure(createResult, "Could not create task");
      return;
    }
    resetEditor();
  };

  const handleDelete = async (task: EnvironmentTask) => {
    const result = await deleteTask({
      environmentId: task.environmentId,
      input: { taskId: task.id },
    });
    if (result._tag === "Failure") {
      showFailure(result, "Could not delete task");
      return false;
    }
    if (editingTaskKey === taskKey(task)) resetEditor();
    return true;
  };

  const taskContext = (task: EnvironmentTask) => ({
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
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search tasks…"
                value={query}
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
            <Button onClick={() => openCreate()} size="sm">
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
              onDelete={(task) => void handleDelete(task)}
              onEdit={openEdit}
              onMove={(task, status, position) => void move(task, status, position)}
              onNewTask={openCreate}
              taskContext={taskContext}
              tasks={visibleTasks}
            />
          ) : (
            <TaskBoard
              onEdit={openEdit}
              onMove={(task, status, position) => void move(task, status, position)}
              onNewTask={openCreate}
              taskContext={taskContext}
              tasks={visibleTasks}
            />
          )}
        </div>
      </main>

      <TaskEditorDialog
        dueDate={dueDate}
        editing={editingTask !== undefined}
        notes={notes}
        onDelete={editingTask ? () => void handleDelete(editingTask) : undefined}
        onDueDateChange={setDueDate}
        onNotesChange={setNotes}
        onOpenChange={(open) => (open ? setEditorOpen(true) : resetEditor())}
        onSave={() => void handleSave()}
        onStatusChange={setEditorStatus}
        onTitleChange={setTitle}
        open={editorOpen}
        saving={saving}
        status={editorStatus}
        title={title}
      />
    </SidebarInset>
  );
}

function TaskEditorDialog({
  open,
  editing,
  title,
  notes,
  dueDate,
  status,
  saving,
  onOpenChange,
  onTitleChange,
  onNotesChange,
  onDueDateChange,
  onStatusChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  editing: boolean;
  title: string;
  notes: string;
  dueDate: Date | undefined;
  status: TaskStatus;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onDueDateChange: (value: Date | undefined) => void;
  onStatusChange: (value: TaskStatus) => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
}) {
  const handleShortcut = (event: ReactKeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (title.trim() && !saving) onSave();
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="max-w-xl" onKeyDownCapture={handleShortcut} showCloseButton={false}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">{editing ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-3 pt-1" scrollFade={false}>
          <input
            aria-label="Task title"
            autoFocus
            className="w-full bg-transparent text-lg font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/55"
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            placeholder="Task title"
            value={title}
          />
          <Textarea
            aria-label="Task notes"
            className="min-h-28 border-transparent bg-muted/25 shadow-none focus-within:border-input focus-within:ring-0 dark:bg-muted/20"
            onChange={(event) => onNotesChange(event.currentTarget.value)}
            placeholder="Add description or notes…"
            value={notes}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <TaskStatusSelect onChange={onStatusChange} status={status} />
            <TaskDueDatePicker date={dueDate} onChange={onDueDateChange} />
          </div>
        </DialogPanel>
        <DialogFooter className="items-center sm:justify-between" variant="bare">
          <div>
            {onDelete ? (
              <Button onClick={onDelete} size="sm" variant="destructive-outline">
                <Trash2Icon /> Delete
              </Button>
            ) : (
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                ⌘ Enter to create
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                ⌘ Enter to save
              </span>
            ) : null}
            <Button onClick={() => onOpenChange(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!title.trim() || saving} onClick={onSave} size="sm">
              {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function TaskDueDatePicker({
  date,
  onChange,
}: {
  date: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className="font-normal" size="sm" variant="outline">
            <CalendarDaysIcon />
            {date
              ? new Intl.DateTimeFormat(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(date)
              : "Due date"}
          </Button>
        }
      />
      <PopoverPopup align="start" className="w-auto" side="bottom" viewportClassName="p-0">
        <Calendar
          mode="single"
          onSelect={(value) => {
            onChange(value);
            if (value) setOpen(false);
          }}
          timeZone={timeZone}
          {...(date === undefined ? {} : { defaultMonth: date, selected: date })}
        />
        <div className="flex items-center justify-between border-t px-2 py-1.5">
          <Button
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            size="xs"
            variant="ghost"
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              onChange(new Date());
              setOpen(false);
            }}
            size="xs"
            variant="ghost"
          >
            Today
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

interface TaskContext {
  project: string | null;
  thread: string | null;
}

interface TaskSurfaceProps {
  tasks: ReadonlyArray<EnvironmentTask>;
  taskContext: (task: EnvironmentTask) => TaskContext;
  onMove: (task: EnvironmentTask, status: TaskStatus, position?: number) => void;
  onNewTask: (status?: TaskStatus) => void;
  onEdit: (task: EnvironmentTask) => void;
}

type TaskDragData =
  | { readonly kind: "task"; readonly task: EnvironmentTask }
  | { readonly kind: "stage"; readonly status: TaskStatus };

function taskDragData(value: unknown): TaskDragData | null {
  if (!value || typeof value !== "object" || !("kind" in value)) return null;
  const data = value as TaskDragData;
  return data.kind === "task" || data.kind === "stage" ? data : null;
}

function TaskDndSurface({
  children,
  onMove,
}: {
  children: ReactNode;
  onMove: TaskSurfaceProps["onMove"];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const [activeTask, setActiveTask] = useState<EnvironmentTask | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const data = taskDragData(event.active.data.current);
    setActiveTask(data?.kind === "task" ? data.task : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeData = taskDragData(event.active.data.current);
    const overData = taskDragData(event.over?.data.current);
    setActiveTask(null);
    if (activeData?.kind !== "task" || !overData) return;

    const translatedTop = event.active.rect.current.translated?.top;
    const after =
      overData.kind === "task" &&
      translatedTop !== undefined &&
      translatedTop > event.over!.rect.top + event.over!.rect.height / 2;
    const target = resolveTaskDropTarget(activeData.task, overData, after);
    if (target) onMove(activeData.task, target.status, target.position);
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>
        {activeTask ? (
          <div className="flex h-9 w-72 items-center gap-2 rounded-md border bg-popover px-3 text-xs shadow-xl">
            <GripVerticalIcon className="size-3.5 text-muted-foreground" />
            <span className="truncate font-medium">{activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function useTaskListAnimationRef() {
  return useCallback((node: HTMLDivElement | null) => {
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    autoAnimate(node, { duration: 180, easing: "ease-out" });
  }, []);
}

function TaskList({
  tasks,
  taskContext,
  onMove,
  onDelete,
  onNewTask,
  onEdit,
}: TaskSurfaceProps & { onDelete: (task: EnvironmentTask) => void }) {
  return (
    <TaskDndSurface onMove={onMove}>
      <div className="min-w-[760px] pb-12">
        {GROUP_ORDER.map((status) => (
          <TaskListStage
            key={status}
            onDelete={onDelete}
            onEdit={onEdit}
            onMove={onMove}
            onNewTask={onNewTask}
            status={status}
            taskContext={taskContext}
            tasks={tasks.filter((task) => task.status === status)}
          />
        ))}
      </div>
    </TaskDndSurface>
  );
}

function TaskListStage({
  status,
  tasks,
  taskContext,
  onMove,
  onDelete,
  onNewTask,
  onEdit,
}: TaskSurfaceProps & {
  status: TaskStatus;
  onDelete: (task: EnvironmentTask) => void;
}) {
  const option = statusOption(status);
  const { isOver, setNodeRef } = useDroppable({
    id: taskStageDragId(status),
    data: { kind: "stage", status } satisfies TaskDragData,
  });
  const attachAnimationRef = useTaskListAnimationRef();

  return (
    <section className={cn("transition-colors", isOver && "bg-primary/[0.035]")} ref={setNodeRef}>
      <div className="group/header flex h-8 items-center gap-2 border-b bg-muted/35 px-4 text-xs font-medium">
        <span>{option.label}</span>
        <span className="font-normal tabular-nums text-muted-foreground">{tasks.length}</span>
        <button
          aria-label={`Add ${option.label.toLowerCase()} task`}
          className="ml-auto flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/header:opacity-100 focus-visible:opacity-100"
          onClick={() => onNewTask(status)}
          type="button"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      <SortableContext items={tasks.map(taskDragId)} strategy={verticalListSortingStrategy}>
        <div className="min-h-8" ref={attachAnimationRef}>
          {tasks.length === 0 ? (
            <div
              className={cn(
                "flex h-8 items-center px-12 text-[11px] text-muted-foreground/45",
                isOver && "text-primary",
              )}
            >
              {isOver ? `Move to ${option.label}` : "No tasks"}
            </div>
          ) : (
            tasks.map((task) => (
              <TaskListRow
                key={taskKey(task)}
                onDelete={() => onDelete(task)}
                onEdit={() => onEdit(task)}
                onToggleDone={() => onMove(task, task.status === "done" ? "todo" : "done")}
                task={task}
                taskContext={taskContext(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function TaskListRow({
  task,
  taskContext,
  onToggleDone,
  onDelete,
  onEdit,
}: {
  task: EnvironmentTask;
  taskContext: TaskContext;
  onToggleDone: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: taskDragId(task),
    data: { kind: "task", task } satisfies TaskDragData,
  });

  return (
    <div
      className={cn(
        "group flex h-9 cursor-pointer items-center gap-2 border-b px-3 text-xs transition-[background-color,opacity] hover:bg-muted/30",
        isDragging && "opacity-35",
      )}
      onClick={onEdit}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag ${task.title}`}
        className="flex size-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/0 outline-none group-hover:text-muted-foreground/60 focus-visible:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        type="button"
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <TaskDoneButton
        done={task.status === "done"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone();
        }}
        title={task.title}
      />
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
          onClick={(event) => event.stopPropagation()}
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

function TaskDoneButton({
  done,
  title,
  onClick,
}: {
  done: boolean;
  title: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label={done ? `Reopen ${title}` : `Complete ${title}`}
      className={cn(
        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        done ? "text-emerald-500" : "text-blue-500",
      )}
      onClick={onClick}
      title={done ? "Reopen task" : "Mark as done"}
      type="button"
    >
      {done ? <CheckCircle2Icon className="size-3.5" /> : <CircleIcon className="size-3.5" />}
    </button>
  );
}

function TaskStatusSelect({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const option = statusOption(status);
  const StatusIcon = option.icon;
  return (
    <Select value={status} onValueChange={(value) => value && onChange(value as TaskStatus)}>
      <SelectTrigger
        aria-label={`Status: ${option.label}`}
        className="h-7 w-auto min-w-0 gap-1.5 px-2 text-xs shadow-none"
        size="compact"
      >
        <StatusIcon className={cn("size-3.5", option.iconClassName)} />
        <SelectValue>{option.label}</SelectValue>
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
  if (!context.project && !context.thread) return null;

  return (
    <span className="hidden max-w-44 items-center gap-1 rounded-sm border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline-flex">
      {context.project ? <span className="truncate">{context.project}</span> : null}
      {context.thread ? <span className="truncate opacity-60">/ {context.thread}</span> : null}
    </span>
  );
}

function TaskDueDate({ task, align = "end" }: { task: EnvironmentTask; align?: "start" | "end" }) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const overdue = due.getTime() < Date.now() && task.status !== "done";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground",
        align === "end" && "w-16 justify-end",
        overdue && "font-medium text-destructive",
      )}
    >
      <CalendarDaysIcon className="size-2.5" />
      {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due)}
    </span>
  );
}

function TaskBoard({ tasks, taskContext, onMove, onNewTask, onEdit }: TaskSurfaceProps) {
  return (
    <TaskDndSurface onMove={onMove}>
      <div className="grid min-w-[900px] grid-cols-4 gap-px bg-border pb-12">
        {STATUS_OPTIONS.map((option) => (
          <TaskBoardStage
            key={option.status}
            onEdit={onEdit}
            onMove={onMove}
            onNewTask={onNewTask}
            status={option.status}
            taskContext={taskContext}
            tasks={tasks.filter((task) => task.status === option.status)}
          />
        ))}
      </div>
    </TaskDndSurface>
  );
}

function TaskBoardStage({
  status,
  tasks,
  taskContext,
  onNewTask,
  onEdit,
}: TaskSurfaceProps & { status: TaskStatus }) {
  const option = statusOption(status);
  const StatusIcon = option.icon;
  const { isOver, setNodeRef } = useDroppable({
    id: taskStageDragId(status),
    data: { kind: "stage", status } satisfies TaskDragData,
  });
  const attachAnimationRef = useTaskListAnimationRef();

  return (
    <section
      className={cn(
        "min-h-[calc(100dvh-var(--workspace-topbar-height)-6rem)] bg-background transition-colors",
        isOver && "bg-primary/[0.035]",
      )}
      ref={setNodeRef}
    >
      <header className="flex h-9 items-center gap-2 border-b px-3">
        <StatusIcon className={cn("size-3.5", option.iconClassName)} />
        <span className="text-xs font-medium">{option.label}</span>
        <Badge className="ml-0.5" size="sm" variant="secondary">
          {tasks.length}
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
      <SortableContext items={tasks.map(taskDragId)} strategy={verticalListSortingStrategy}>
        <div className="min-h-20 space-y-2 bg-muted/10 p-2" ref={attachAnimationRef}>
          {tasks.map((task) => (
            <TaskBoardCard
              context={taskContext(task)}
              key={taskKey(task)}
              onEdit={() => onEdit(task)}
              option={option}
              task={task}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="flex h-16 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground/45">
              {isOver ? `Move to ${option.label}` : "No tasks"}
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function TaskBoardCard({
  task,
  context,
  option,
  onEdit,
}: {
  task: EnvironmentTask;
  context: TaskContext;
  option: (typeof STATUS_OPTIONS)[number];
  onEdit: () => void;
}) {
  const StatusIcon = option.icon;
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: taskDragId(task),
    data: { kind: "task", task } satisfies TaskDragData,
  });
  return (
    <article
      className={cn(
        "cursor-pointer rounded-md border bg-card px-3 py-2.5 shadow-xs transition-[border-color,opacity] hover:border-foreground/20",
        isDragging && "opacity-35",
      )}
      onClick={onEdit}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <button
          {...attributes}
          {...listeners}
          aria-label={`Drag ${task.title}`}
          className="flex size-4 cursor-grab items-center justify-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <GripVerticalIcon className="size-3" />
        </button>
        <StatusIcon className={cn("size-3", option.iconClassName)} />
        <TaskDueDate align="start" task={task} />
      </div>
      <div className="mt-1.5 text-[12px] font-medium leading-5">{task.title}</div>
      {task.notes ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
          {task.notes}
        </p>
      ) : null}
      {context.project || context.thread ? (
        <div className="mt-3 flex items-center gap-2 border-t pt-2">
          <span className="ml-auto max-w-32 truncate text-[10px] text-muted-foreground">
            {[context.project, context.thread].filter(Boolean).join(" / ")}
          </span>
        </div>
      ) : null}
    </article>
  );
}

export const Route = createFileRoute("/tasks")({
  beforeLoad: () => {
    if (!isElectron) throw redirect({ to: "/" });
  },
  component: TasksPage,
});
