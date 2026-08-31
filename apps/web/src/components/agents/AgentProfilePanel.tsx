import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  AgentRoutine,
  AgentRoutineDraft,
  AgentRoutineSchedule,
  ScopedThreadRef,
} from "@t3tools/contracts";
import {
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Clock3Icon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { newMessageId, randomUUID } from "~/lib/utils";
import { threadEnvironment } from "~/state/threads";
import { useThread } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Frequency = AgentRoutineSchedule["kind"];

interface RoutineFormState {
  id: string | null;
  enabled: boolean;
  name: string;
  prompt: string;
  frequency: Frequency;
  onceAt: string;
  time: string;
  weekDay: number;
  monthDay: number;
  timeZone: string;
}

function localDateTimeInput(date = new Date(Date.now() + 60 * 60 * 1000)): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyRoutineForm(): RoutineFormState {
  return {
    id: null,
    enabled: true,
    name: "",
    prompt: "",
    frequency: "daily",
    onceAt: localDateTimeInput(),
    time: "09:00",
    weekDay: 1,
    monthDay: 1,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function routineForm(routine: AgentRoutine): RoutineFormState {
  const schedule = routine.schedule;
  return {
    id: routine.id,
    enabled: routine.enabled,
    name: routine.name,
    prompt: routine.prompt,
    frequency: schedule.kind,
    onceAt:
      schedule.kind === "once" ? localDateTimeInput(new Date(schedule.at)) : localDateTimeInput(),
    time:
      schedule.kind === "once"
        ? "09:00"
        : `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`,
    weekDay: schedule.kind === "weekly" ? schedule.weekDay : 1,
    monthDay: schedule.kind === "monthly" ? schedule.monthDay : 1,
    timeZone: schedule.timeZone,
  };
}

function draftFromForm(form: RoutineFormState): AgentRoutineDraft | null {
  const [hourText = "0", minuteText = "0"] = form.time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const shared = {
    id: form.id ?? randomUUID(),
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    enabled: form.enabled,
  };
  if (!shared.name || !shared.prompt || !form.timeZone.trim()) return null;

  let schedule: AgentRoutineSchedule;
  if (form.frequency === "once") {
    const at = new Date(form.onceAt);
    if (Number.isNaN(at.getTime())) return null;
    schedule = { kind: "once", at: at.toISOString(), timeZone: form.timeZone.trim() };
  } else if (form.frequency === "weekly") {
    schedule = {
      kind: "weekly",
      weekDay: form.weekDay,
      hour,
      minute,
      timeZone: form.timeZone.trim(),
    };
  } else if (form.frequency === "monthly") {
    schedule = {
      kind: "monthly",
      monthDay: form.monthDay,
      hour,
      minute,
      timeZone: form.timeZone.trim(),
    };
  } else {
    schedule = { kind: "daily", hour, minute, timeZone: form.timeZone.trim() };
  }
  return { ...shared, schedule };
}

function asDraft(routine: AgentRoutine, enabled = routine.enabled): AgentRoutineDraft {
  return {
    id: routine.id,
    name: routine.name,
    prompt: routine.prompt,
    enabled,
    schedule: routine.schedule,
  };
}

function scheduleLabel(routine: AgentRoutine): string {
  const schedule = routine.schedule;
  if (schedule.kind === "once") {
    return `Once · ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: schedule.timeZone,
    }).format(new Date(schedule.at))}`;
  }
  const time = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  if (schedule.kind === "weekly") return `${WEEK_DAYS[schedule.weekDay]}s · ${time}`;
  if (schedule.kind === "monthly") return `Monthly on day ${schedule.monthDay} · ${time}`;
  return `Daily · ${time}`;
}

function mutationError(result: { _tag: string }): string | null {
  if (result._tag !== "Failure") return null;
  const error = squashAtomCommandFailure(
    result as unknown as Parameters<typeof squashAtomCommandFailure>[0],
  );
  return error instanceof Error ? error.message : "An error occurred.";
}

export function AgentProfilePanel({
  threadRef,
  beforeRun,
}: {
  threadRef: ScopedThreadRef;
  beforeRun?: () => Promise<string | null>;
}) {
  const thread = useThread(threadRef);
  const [instructions, setInstructions] = useState("");
  const [allowRoutineManagement, setAllowRoutineManagement] = useState(false);
  const [allowTaskManagement, setAllowTaskManagement] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [form, setForm] = useState<RoutineFormState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const updateProfile = useAtomCommand(threadEnvironment.updateAgentProfile, {
    reportFailure: false,
  });
  const upsertRoutine = useAtomCommand(threadEnvironment.upsertAgentRoutine, {
    reportFailure: false,
  });
  const deleteRoutine = useAtomCommand(threadEnvironment.deleteAgentRoutine, {
    reportFailure: false,
  });
  const requestRun = useAtomCommand(threadEnvironment.requestAgentRun, { reportFailure: false });
  const stopSession = useAtomCommand(threadEnvironment.stopSession, { reportFailure: false });

  useEffect(() => {
    setInstructions(thread?.agentProfile?.instructions ?? "");
    setAllowRoutineManagement(thread?.agentProfile?.allowRoutineManagement === true);
    setAllowTaskManagement(thread?.agentProfile?.allowTaskManagement === true);
    setProfileDirty(false);
    setForm(null);
  }, [
    thread?.agentProfile?.allowRoutineManagement,
    thread?.agentProfile?.allowTaskManagement,
    thread?.agentProfile?.instructions,
    thread?.id,
  ]);

  const routines = useMemo(
    () => [...(thread?.agentRoutines ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [thread?.agentRoutines],
  );
  const runs = useMemo(
    () =>
      [...(thread?.agentRuns ?? [])]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 30),
    [thread?.agentRuns],
  );

  if (!thread || thread.kind !== "agent") return null;

  const showError = (title: string, description: string) =>
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  const saveProfile = async () => {
    if (!instructions.trim()) return;
    const capabilitiesChanged =
      allowRoutineManagement !== (thread.agentProfile?.allowRoutineManagement === true) ||
      allowTaskManagement !== (thread.agentProfile?.allowTaskManagement === true);
    setPendingAction("profile");
    const result = await updateProfile({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        profile: {
          instructions: instructions.trim(),
          allowRoutineManagement,
          allowTaskManagement,
        },
      },
    });
    setPendingAction(null);
    const error = mutationError(result);
    if (error) return showError("Could not save instructions", error);
    if (capabilitiesChanged && thread.session && thread.session.status !== "stopped") {
      const stopResult = await stopSession({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      });
      const stopError = mutationError(stopResult);
      if (stopError) {
        showError("Permissions saved", "Restart this Agent Chat session to apply its new tools.");
      }
    }
    setProfileDirty(false);
  };

  const saveRoutine = async () => {
    if (!form) return;
    const draft = draftFromForm(form);
    if (!draft) {
      showError("Routine is incomplete", "Add a name, prompt, valid schedule, and time zone.");
      return;
    }
    setPendingAction("routine");
    const result = await upsertRoutine({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, routine: draft },
    });
    setPendingAction(null);
    const error = mutationError(result);
    if (error) return showError("Could not save routine", error);
    setForm(null);
  };

  const setRoutineEnabled = async (routine: AgentRoutine, enabled: boolean) => {
    setPendingAction(`toggle:${routine.id}`);
    const result = await upsertRoutine({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, routine: asDraft(routine, enabled) },
    });
    setPendingAction(null);
    const error = mutationError(result);
    if (error) showError("Could not update routine", error);
  };

  const removeRoutine = async (routine: AgentRoutine) => {
    setPendingAction(`delete:${routine.id}`);
    const result = await deleteRoutine({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, routineId: routine.id },
    });
    setPendingAction(null);
    const error = mutationError(result);
    if (error) showError("Could not delete routine", error);
  };

  const runNow = async (routine: AgentRoutine) => {
    const now = new Date().toISOString();
    setPendingAction(`run:${routine.id}`);
    const preparationError = await beforeRun?.();
    if (preparationError) {
      setPendingAction(null);
      showError("Could not prepare routine", preparationError);
      return;
    }
    const result = await requestRun({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        routineId: routine.id,
        runId: randomUUID(),
        messageId: newMessageId(),
        scheduledFor: now,
        createdAt: now,
      },
    });
    setPendingAction(null);
    const error = mutationError(result);
    if (error) showError("Could not start routine", error);
  };

  return (
    <ScrollArea className="h-full bg-background">
      <div className="space-y-8 p-5 pb-12">
        <section>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
              <BotIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{thread.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Persistent agent profile</p>
            </div>
          </div>
          <Field>
            <FieldLabel>Standing instructions</FieldLabel>
            <Textarea
              className="min-h-36 resize-y text-xs leading-5"
              value={instructions}
              onChange={(event) => {
                setInstructions(event.currentTarget.value);
                setProfileDirty(true);
              }}
            />
            <FieldDescription>
              Injected into every manual message and routine run. The visible chat stays clean.
            </FieldDescription>
          </Field>
          <div className="mt-4 divide-y rounded-xl border bg-muted/18 px-3">
            <label className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block text-xs font-medium">Allow routine management</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  Lets this Agent Chat create, edit, run, pause, and delete its own routines.
                </span>
              </span>
              <Switch
                checked={allowRoutineManagement}
                onCheckedChange={(checked) => {
                  setAllowRoutineManagement(checked);
                  setProfileDirty(true);
                }}
                aria-label="Allow routine management"
              />
            </label>
            <label className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block text-xs font-medium">Allow task management</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  Lets this Agent Chat manage Tasks in this environment.
                </span>
              </span>
              <Switch
                checked={allowTaskManagement}
                onCheckedChange={(checked) => {
                  setAllowTaskManagement(checked);
                  setProfileDirty(true);
                }}
                aria-label="Allow task management"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={!profileDirty || !instructions.trim() || pendingAction === "profile"}
              onClick={() => void saveProfile()}
            >
              Save instructions
            </Button>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Routines</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Runs while the desktop app is open.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setForm(emptyRoutineForm())}>
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>

          {form ? (
            <div className="mb-4 space-y-4 rounded-xl border bg-muted/18 p-4">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  size="compact"
                  value={form.name}
                  onValueChange={(name) => setForm((current) => current && { ...current, name })}
                  placeholder="Morning repository check"
                />
              </Field>
              <Field>
                <FieldLabel>Prompt</FieldLabel>
                <Textarea
                  className="min-h-28 resize-y text-xs leading-5"
                  value={form.prompt}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setForm((current) => (current ? { ...current, prompt: value } : current));
                  }}
                  placeholder="Review open work, run focused checks, and tell me what needs attention."
                />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Uses this Agent Chat's current model, reasoning, and access settings when it runs.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Frequency</FieldLabel>
                  <Select
                    value={form.frequency}
                    onValueChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, frequency: value as Frequency } : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectPopup>
                  </Select>
                </Field>
                {form.frequency === "once" ? (
                  <Field>
                    <FieldLabel>When</FieldLabel>
                    <Input
                      nativeInput
                      type="datetime-local"
                      size="compact"
                      value={form.onceAt}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setForm((current) => (current ? { ...current, onceAt: value } : current));
                      }}
                    />
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel>Time</FieldLabel>
                    <Input
                      nativeInput
                      type="time"
                      size="compact"
                      value={form.time}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setForm((current) => (current ? { ...current, time: value } : current));
                      }}
                    />
                  </Field>
                )}
              </div>
              {form.frequency === "weekly" ? (
                <Field>
                  <FieldLabel>Day</FieldLabel>
                  <Select
                    value={String(form.weekDay)}
                    onValueChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, weekDay: Number(value) } : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {WEEK_DAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
              ) : null}
              {form.frequency === "monthly" ? (
                <Field>
                  <FieldLabel>Day of month</FieldLabel>
                  <Input
                    nativeInput
                    type="number"
                    min={1}
                    max={31}
                    size="compact"
                    value={form.monthDay}
                    onChange={(event) => {
                      const monthDay = Number(event.currentTarget.value);
                      setForm((current) => (current ? { ...current, monthDay } : current));
                    }}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>Time zone</FieldLabel>
                <Input
                  size="compact"
                  value={form.timeZone}
                  onValueChange={(timeZone) =>
                    setForm((current) => current && { ...current, timeZone })
                  }
                  placeholder="Australia/Melbourne"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pendingAction === "routine"}
                  onClick={() => void saveRoutine()}
                >
                  {form.id ? "Save routine" : "Create routine"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {routines.length === 0 && !form ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                <CalendarClockIcon className="mx-auto size-5 text-muted-foreground/55" />
                <p className="mt-2 text-xs text-muted-foreground">No routines yet.</p>
              </div>
            ) : (
              routines.map((routine) => (
                <div key={routine.id} className="rounded-xl border bg-card/50 p-3">
                  <div className="flex items-start gap-3">
                    <Clock3Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setForm(routineForm(routine))}
                    >
                      <span className="block truncate text-xs font-medium">{routine.name}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {scheduleLabel(routine)} · {routine.schedule.timeZone}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-muted-foreground/65">
                        Uses current Agent Chat settings
                      </span>
                      {routine.nextRunAt ? (
                        <span className="mt-1 block text-[10px] text-muted-foreground/65">
                          Next {new Date(routine.nextRunAt).toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                    <Switch
                      checked={routine.enabled}
                      disabled={pendingAction === `toggle:${routine.id}`}
                      onCheckedChange={(enabled) => void setRoutineEnabled(routine, enabled)}
                      aria-label={`${routine.enabled ? "Disable" : "Enable"} ${routine.name}`}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={
                        pendingAction === `delete:${routine.id}` ||
                        runs.some((run) => run.routineId === routine.id && run.status === "running")
                      }
                      onClick={() => void removeRoutine(routine)}
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={pendingAction === `run:${routine.id}`}
                      onClick={() => void runNow(routine)}
                    >
                      <PlayIcon className="size-3" />
                      Run now
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Agent Runs</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Routine responses appear directly in this chat.
            </p>
          </div>
          {runs.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              Routine results will appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const routineName = routines.find((routine) => routine.id === run.routineId)?.name;
                const StatusIcon =
                  run.status === "completed"
                    ? CheckCircle2Icon
                    : run.status === "failed"
                      ? XCircleIcon
                      : RotateCwIcon;
                return (
                  <div key={run.id} className="w-full rounded-xl border bg-card/50 p-3 text-left">
                    <div className="flex items-start gap-2.5">
                      <StatusIcon
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          run.status === "completed"
                            ? "text-emerald-500"
                            : run.status === "failed"
                              ? "text-destructive"
                              : "animate-spin text-amber-500",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium">
                            {routineName ?? "Routine run"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/65">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                        </span>
                        {run.summary || run.error || run.attentionSummary ? (
                          <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                            {run.summary ?? run.error ?? run.attentionSummary}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
