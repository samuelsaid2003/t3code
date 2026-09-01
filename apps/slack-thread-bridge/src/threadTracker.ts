// @effect-diagnostics globalTimers:off -- Promise waiters bridge T3's Effect stream to Slack callbacks.
import type {
  AgentRun,
  MessageId,
  OrchestrationEvent,
  OrchestrationMessage,
  OrchestrationThread,
  OrchestrationThreadStreamItem,
  ProviderInteractionMode,
  RuntimeMode,
  TurnId,
} from "@t3tools/contracts";

export interface TurnCompletion {
  readonly turnId: TurnId;
  readonly status: "ready" | "missing" | "error";
  readonly assistantMessageId: MessageId | null;
  readonly completedAt: string;
}

type TrackerListener = (event: OrchestrationEvent | null) => void;

function eventMessage(
  payload: Extract<OrchestrationEvent, { type: "thread.message-sent" }>["payload"],
): OrchestrationMessage {
  return {
    id: payload.messageId,
    role: payload.role,
    text: payload.text,
    ...(payload.routineRunId === undefined ? {} : { routineRunId: payload.routineRunId }),
    ...(payload.attachments === undefined ? {} : { attachments: payload.attachments }),
    ...(payload.externalSource === undefined ? {} : { externalSource: payload.externalSource }),
    turnId: payload.turnId,
    streaming: payload.streaming,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

export class ThreadTracker {
  private thread: OrchestrationThread | null = null;
  private synchronized = false;
  private activeTurnId: TurnId | null = null;
  private readonly messages = new Map<string, OrchestrationMessage>();
  private readonly completions = new Map<string, TurnCompletion>();
  private readonly pendingStartMessageIds: MessageId[] = [];
  private readonly turnByMessageId = new Map<string, TurnId>();
  private readonly agentRuns = new Map<string, AgentRun>();
  private readonly listeners = new Set<TrackerListener>();

  apply(item: OrchestrationThreadStreamItem): void {
    if (item.kind === "snapshot") {
      this.applySnapshot(item.snapshot.thread);
      this.notify(null);
      return;
    }
    if (item.kind === "synchronized") {
      this.synchronized = true;
      this.notify(null);
      return;
    }
    this.applyEvent(item.event);
    this.notify(item.event);
  }

  subscribe(listener: TrackerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async waitUntilReady(timeoutMs: number): Promise<void> {
    await this.waitFor(
      () => (this.thread !== null && this.synchronized ? true : undefined),
      timeoutMs,
      "T3 did not finish synchronizing the configured thread",
    );
  }

  async waitUntilAvailable(timeoutMs: number): Promise<void> {
    await this.waitFor(
      () => {
        if (this.thread === null) return undefined;
        const sessionBusy =
          this.thread.session?.status === "starting" || this.thread.session?.status === "running";
        return !sessionBusy && this.thread.latestTurn?.state !== "running" ? true : undefined;
      },
      timeoutMs,
      "The configured T3 thread stayed busy",
    );
  }

  currentTurnSettings(): {
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
  } {
    if (this.thread === null) {
      throw new Error("The T3 thread has not synchronized yet.");
    }
    return {
      runtimeMode: this.thread.runtimeMode,
      interactionMode: this.thread.interactionMode,
    };
  }

  existingAnswer(messageId: MessageId): string | undefined {
    return this.existingAnswerMessage(messageId)?.text;
  }

  existingAnswerMessage(messageId: MessageId): OrchestrationMessage | undefined {
    if (this.thread === null) return undefined;
    const ordered = [...this.messages.values()].toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
    const userIndex = ordered.findIndex((entry) => entry.id === messageId && entry.role === "user");
    if (userIndex < 0) return undefined;
    const nextUserIndex = ordered.findIndex(
      (entry, index) => index > userIndex && entry.role === "user",
    );
    const end = nextUserIndex < 0 ? ordered.length : nextUserIndex;
    return ordered
      .slice(userIndex + 1, end)
      .findLast(
        (entry) => entry.role === "assistant" && !entry.streaming && entry.text.trim() !== "",
      );
  }

  async waitForTurnId(messageId: MessageId, timeoutMs: number): Promise<TurnId> {
    return await this.waitFor(
      () => this.turnByMessageId.get(messageId) ?? this.recoverLatestTurnId(messageId),
      timeoutMs,
      "T3 accepted the Slack message but did not start its turn",
    );
  }

  async waitForCompletion(turnId: TurnId, timeoutMs: number): Promise<TurnCompletion> {
    return await this.waitFor(
      () => this.completions.get(turnId),
      timeoutMs,
      "The T3 turn did not complete before the Slack bridge timeout",
    );
  }

  async finalAssistantText(completion: TurnCompletion, timeoutMs: number): Promise<string> {
    return (await this.finalAssistantMessage(completion, timeoutMs)).text;
  }

  async finalAssistantMessage(
    completion: TurnCompletion,
    timeoutMs: number,
  ): Promise<OrchestrationMessage> {
    const resolve = () => {
      if (completion.assistantMessageId !== null) {
        const message = this.messages.get(completion.assistantMessageId);
        if (message?.role === "assistant" && !message.streaming && message.text.trim() !== "") {
          return message;
        }
      }
      return [...this.messages.values()]
        .filter(
          (message) =>
            message.role === "assistant" &&
            message.turnId === completion.turnId &&
            !message.streaming &&
            message.text.trim() !== "",
        )
        .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
        .at(-1);
    };
    return await this.waitFor(resolve, timeoutMs, "T3 completed without a final assistant message");
  }

  routineResponse(
    event: Extract<OrchestrationEvent, { type: "thread.agent-run-completed" }>,
  ): string {
    return this.routineResponseDetails(event).text;
  }

  routineResponseDetails(
    event: Extract<OrchestrationEvent, { type: "thread.agent-run-completed" }>,
  ): { readonly text: string; readonly messageId?: MessageId } {
    if (event.payload.status === "failed") {
      return {
        text: `Scheduled routine failed: ${event.payload.error ?? "T3 did not provide an error."}`,
      };
    }
    const run = this.agentRuns.get(event.payload.runId);
    if (run !== undefined) {
      const turnId =
        run.messageId === undefined ? undefined : this.turnByMessageId.get(run.messageId);
      const response = [...this.messages.values()]
        .filter(
          (message) =>
            message.role === "assistant" &&
            !message.streaming &&
            (turnId === undefined ? true : message.turnId === turnId) &&
            message.createdAt >= run.startedAt &&
            message.createdAt <= event.payload.completedAt &&
            message.text.trim() !== "",
        )
        .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
        .at(-1);
      if (response !== undefined) return { text: response.text, messageId: response.id };
    }
    return { text: event.payload.summary ?? "Scheduled routine completed." };
  }

  private applySnapshot(thread: OrchestrationThread): void {
    this.thread = thread;
    this.activeTurnId = thread.session?.activeTurnId ?? null;
    this.messages.clear();
    for (const message of thread.messages) this.messages.set(message.id, message);
    this.completions.clear();
    for (const checkpoint of thread.checkpoints) {
      this.completions.set(checkpoint.turnId, {
        turnId: checkpoint.turnId,
        status: checkpoint.status,
        assistantMessageId: checkpoint.assistantMessageId,
        completedAt: checkpoint.completedAt,
      });
    }
    this.agentRuns.clear();
    for (const run of thread.agentRuns ?? []) this.agentRuns.set(run.id, run);
  }

  private applyEvent(event: OrchestrationEvent): void {
    if (this.thread === null) return;
    switch (event.type) {
      case "thread.runtime-mode-set":
        this.thread = { ...this.thread, runtimeMode: event.payload.runtimeMode };
        break;
      case "thread.interaction-mode-set":
        this.thread = { ...this.thread, interactionMode: event.payload.interactionMode };
        break;
      case "thread.message-sent":
        this.applyMessage(event);
        break;
      case "thread.message-delivery-recorded": {
        const message = this.messages.get(event.payload.messageId);
        if (message !== undefined) {
          this.messages.set(message.id, {
            ...message,
            deliveryReceipts: [
              ...(message.deliveryReceipts ?? []).filter(
                (receipt) => receipt.channel !== event.payload.receipt.channel,
              ),
              event.payload.receipt,
            ],
            updatedAt: event.payload.updatedAt,
          });
        }
        break;
      }
      case "thread.turn-start-requested":
        if (
          !this.pendingStartMessageIds.includes(event.payload.messageId) &&
          !this.turnByMessageId.has(event.payload.messageId)
        ) {
          this.pendingStartMessageIds.push(event.payload.messageId);
        }
        break;
      case "thread.session-set":
        this.applySession(event);
        break;
      case "thread.turn-diff-completed":
        this.completions.set(event.payload.turnId, {
          turnId: event.payload.turnId,
          status: event.payload.status,
          assistantMessageId: event.payload.assistantMessageId,
          completedAt: event.payload.completedAt,
        });
        this.thread = {
          ...this.thread,
          latestTurn: {
            turnId: event.payload.turnId,
            state: event.payload.status === "error" ? "error" : "completed",
            requestedAt: this.thread.latestTurn?.requestedAt ?? event.payload.completedAt,
            startedAt: this.thread.latestTurn?.startedAt ?? event.payload.completedAt,
            completedAt: event.payload.completedAt,
            assistantMessageId: event.payload.assistantMessageId,
          },
        };
        break;
      case "thread.agent-run-requested":
        this.agentRuns.set(event.payload.run.id, event.payload.run);
        break;
      case "thread.agent-run-completed": {
        const run = this.agentRuns.get(event.payload.runId);
        if (run !== undefined) {
          this.agentRuns.set(event.payload.runId, {
            ...run,
            status: event.payload.status,
            completedAt: event.payload.completedAt,
            summary: event.payload.summary ?? null,
            error: event.payload.error ?? null,
          });
        }
        break;
      }
    }
  }

  private applyMessage(event: Extract<OrchestrationEvent, { type: "thread.message-sent" }>): void {
    const incoming = eventMessage(event.payload);
    const existing = this.messages.get(incoming.id);
    if (existing === undefined) {
      this.messages.set(incoming.id, incoming);
      if (
        incoming.role === "user" &&
        incoming.externalSource === "slack" &&
        !this.pendingStartMessageIds.includes(incoming.id) &&
        !this.turnByMessageId.has(incoming.id)
      ) {
        this.pendingStartMessageIds.push(incoming.id);
      }
      return;
    }
    this.messages.set(incoming.id, {
      ...existing,
      ...incoming,
      text: incoming.streaming
        ? `${existing.text}${incoming.text}`
        : incoming.text.length > 0
          ? incoming.text
          : existing.text,
    });
  }

  private applySession(event: Extract<OrchestrationEvent, { type: "thread.session-set" }>): void {
    const nextActiveTurnId = event.payload.session.activeTurnId;
    if (nextActiveTurnId !== null && nextActiveTurnId !== this.activeTurnId) {
      const messageId = this.pendingStartMessageIds.shift();
      if (messageId !== undefined) this.turnByMessageId.set(messageId, nextActiveTurnId);
    }
    this.activeTurnId = nextActiveTurnId;
    this.thread = { ...this.thread!, session: event.payload.session };
  }

  private recoverLatestTurnId(messageId: MessageId): TurnId | undefined {
    if (this.thread?.latestTurn === null || this.thread?.latestTurn === undefined) return undefined;
    const message = this.messages.get(messageId);
    if (message?.role !== "user") return undefined;
    const laterUserMessage = [...this.messages.values()].some(
      (entry) => entry.role === "user" && entry.createdAt > message.createdAt,
    );
    if (laterUserMessage || this.thread.latestTurn.requestedAt < message.createdAt)
      return undefined;
    this.turnByMessageId.set(messageId, this.thread.latestTurn.turnId);
    return this.thread.latestTurn.turnId;
  }

  private notify(event: OrchestrationEvent | null): void {
    for (const listener of this.listeners) listener(event);
  }

  private async waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const immediate = read();
    if (immediate !== undefined) return immediate;
    return await new Promise<T>((resolve, reject) => {
      const finish = () => {
        const value = read();
        if (value === undefined) return;
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve(value);
      };
      const check = () => finish();
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`${timeoutMessage} (${String(timeoutMs)}ms).`));
      }, timeoutMs);
      this.listeners.add(check);
      finish();
    });
  }
}
