import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentTask } from "@t3tools/client-runtime/state/models";
import { TaskId, type TaskStatus } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";

import { AppText } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { uuidv4 } from "../../lib/uuid";
import { environmentTasks, taskEnvironment } from "../../state/tasks";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceState } from "../../state/workspace";

const STATUSES: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

export function TasksScreen(props: { readonly searchQuery: string; readonly compact?: boolean }) {
  const tasks = useAtomValue(environmentTasks.tasksAtom);
  const { environments } = useWorkspaceState();
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: true });
  const moveTask = useAtomCommand(taskEnvironment.move, { reportFailure: true });
  const deleteTask = useAtomCommand(taskEnvironment.delete, { reportFailure: true });
  const [view, setView] = useState<"checklist" | "kanban">("checklist");
  const [title, setTitle] = useState("");
  const normalizedQuery = props.searchQuery.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.title.toLocaleLowerCase().includes(normalizedQuery))
        .sort(
          (left, right) =>
            left.position - right.position || left.createdAt.localeCompare(right.createdAt),
        ),
    [normalizedQuery, tasks],
  );

  const move = (task: EnvironmentTask, status: TaskStatus) =>
    moveTask({
      environmentId: task.environmentId,
      input: {
        taskId: task.id,
        status,
        position: Math.max(
          0,
          ...tasks.filter((entry) => entry.status === status).map((entry) => entry.position + 1),
        ),
      },
    });

  const chooseStatus = (task: EnvironmentTask) => {
    Alert.alert("Move task", task.title, [
      ...STATUSES.map(({ status, label }) => ({
        text: label,
        onPress: () => void move(task, status),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const add = () => {
    const environmentId = environments[0]?.environmentId;
    const trimmed = title.trim();
    if (!environmentId || !trimmed) return;
    setTitle("");
    void createTask({
      environmentId,
      input: { taskId: TaskId.make(uuidv4()), title: trimmed, status: "todo" },
    });
  };

  return (
    <View className="flex-1 bg-screen">
      <View className="flex-row gap-2 border-b border-border px-4 py-3">
        <TextInput
          accessibilityLabel="New task title"
          className="min-h-11 flex-1 rounded-xl border border-input-border bg-input px-3 font-sans text-base text-foreground"
          onChangeText={setTitle}
          onSubmitEditing={add}
          placeholder="Add a task…"
          placeholderTextColorClassName="accent-placeholder"
          returnKeyType="done"
          value={title}
        />
        <Pressable
          accessibilityLabel="Add task"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-xl bg-accent"
          onPress={add}
        >
          <SymbolView
            name="plus"
            size={17}
            tintColorClassName="accent-foreground"
            type="monochrome"
          />
        </Pressable>
      </View>
      <View className="flex-row gap-1 px-4 py-3">
        {(["checklist", "kanban"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: view === option }}
            className={`rounded-full px-4 py-2 ${view === option ? "bg-accent" : "bg-subtle"}`}
            onPress={() => setView(option)}
          >
            <AppText
              className={`text-sm font-t3-medium ${view === option ? "text-accent-foreground" : "text-foreground"}`}
            >
              {option === "checklist" ? "Checklist" : "Kanban"}
            </AppText>
          </Pressable>
        ))}
      </View>
      {view === "checklist" ? (
        <ScrollView contentContainerClassName="gap-2 px-4 pb-16">
          {visible.map((task) => (
            <MobileTaskCard
              key={`${task.environmentId}:${task.id}`}
              task={task}
              onMove={move}
              onChooseStatus={chooseStatus}
              onDelete={() =>
                void deleteTask({ environmentId: task.environmentId, input: { taskId: task.id } })
              }
            />
          ))}
          {visible.length === 0 ? <EmptyTasks /> : null}
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          contentContainerClassName="gap-3 px-4 pb-16"
          showsHorizontalScrollIndicator={false}
        >
          {STATUSES.map(({ status, label }) => (
            <View className="w-72 rounded-2xl border border-border bg-subtle p-3" key={status}>
              <View className="mb-3 flex-row items-center">
                <AppText className="flex-1 text-sm font-t3-semibold">{label}</AppText>
                <AppText className="text-xs text-foreground-muted">
                  {visible.filter((task) => task.status === status).length}
                </AppText>
              </View>
              <View className="gap-2">
                {visible
                  .filter((task) => task.status === status)
                  .map((task) => (
                    <MobileTaskCard
                      key={`${task.environmentId}:${task.id}`}
                      task={task}
                      onMove={move}
                      onChooseStatus={chooseStatus}
                      onDelete={() =>
                        void deleteTask({
                          environmentId: task.environmentId,
                          input: { taskId: task.id },
                        })
                      }
                    />
                  ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function MobileTaskCard(props: {
  readonly task: EnvironmentTask;
  readonly onMove: (task: EnvironmentTask, status: TaskStatus) => unknown;
  readonly onChooseStatus: (task: EnvironmentTask) => void;
  readonly onDelete: () => void;
}) {
  const statusIndex = STATUSES.findIndex((entry) => entry.status === props.task.status);
  const due = props.task.dueAt ? new Date(props.task.dueAt) : null;
  return (
    <Pressable
      accessibilityActions={[
        { name: "increment", label: "Move to next status" },
        { name: "decrement", label: "Move to previous status" },
        { name: "activate", label: "Toggle complete" },
        { name: "escape", label: "Delete task" },
      ]}
      accessibilityHint="Long press to choose a status"
      accessibilityLabel={`${props.task.title}, ${STATUSES[statusIndex]?.label ?? props.task.status}`}
      accessibilityRole="button"
      className="rounded-2xl border border-border bg-card px-4 py-3"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment" && statusIndex < STATUSES.length - 1)
          void props.onMove(props.task, STATUSES[statusIndex + 1]!.status);
        if (event.nativeEvent.actionName === "decrement" && statusIndex > 0)
          void props.onMove(props.task, STATUSES[statusIndex - 1]!.status);
        if (event.nativeEvent.actionName === "activate")
          void props.onMove(props.task, props.task.status === "done" ? "todo" : "done");
        if (event.nativeEvent.actionName === "escape") props.onDelete();
      }}
      onLongPress={() => props.onChooseStatus(props.task)}
      onPress={() => void props.onMove(props.task, props.task.status === "done" ? "todo" : "done")}
    >
      <View className="flex-row items-start gap-3">
        <SymbolView
          name={props.task.status === "done" ? "checkmark.circle.fill" : "circle"}
          size={20}
          tintColorClassName={props.task.status === "done" ? "success" : "accent-foreground-muted"}
          type="monochrome"
        />
        <View className="min-w-0 flex-1">
          <AppText
            className={`text-[15px] font-t3-medium ${props.task.status === "done" ? "text-foreground-muted line-through" : "text-foreground"}`}
          >
            {props.task.title}
          </AppText>
          <AppText
            className={`mt-1 text-xs ${due && due.getTime() < Date.now() && props.task.status !== "done" ? "text-danger" : "text-foreground-muted"}`}
          >
            {due
              ? `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : STATUSES[statusIndex]?.label}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyTasks() {
  return (
    <View className="items-center px-8 py-20">
      <SymbolView
        name="checklist"
        size={28}
        tintColorClassName="accent-foreground-muted"
        type="monochrome"
      />
      <AppText className="mt-4 text-base font-t3-semibold">No tasks yet</AppText>
      <AppText className="mt-1 text-center text-sm text-foreground-muted">
        Add one above or ask an Agent Chat with task management enabled.
      </AppText>
    </View>
  );
}
