import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  MessageId,
  type OrchestrationForwardSource,
  ThreadId,
} from "@t3tools/contracts";
import { IconArrowLeft, IconCheck, IconSend } from "@tabler/icons-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../../components/AppText";
import { uuidv4 } from "../../lib/uuid";
import { orchestrationEnvironment } from "../../state/orchestration";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";

function compileForwardedResponses(sources: ReadonlyArray<OrchestrationForwardSource>): string {
  return [
    "Forwarded responses",
    ...sources.flatMap((source) => [`## ${source.title}`, source.text.trim()]),
  ].join("\n\n");
}

interface ForwardResponsesModalProps {
  readonly environmentId: EnvironmentId;
  readonly sourceThreadId: ThreadId;
  readonly sourceMessageId: MessageId;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onClose: () => void;
}

export function ForwardResponsesModal(props: ForwardResponsesModalProps) {
  const insets = useSafeAreaInsets();
  const resolveSources = useAtomQueryRunner(orchestrationEnvironment.forwardSources, {
    reportFailure: false,
  });
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const candidates = useMemo(
    () =>
      [...props.threads]
        .filter(
          (thread) =>
            thread.environmentId === props.environmentId &&
            (thread.kind === "standard" || thread.kind === "agent") &&
            thread.archivedAt === null,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [props.environmentId, props.threads],
  );
  const [step, setStep] = useState<"sources" | "review">("sources");
  const [selectedThreadIds, setSelectedThreadIds] = useState<ReadonlySet<ThreadId>>(
    () => new Set([props.sourceThreadId]),
  );
  const [destinationThreadId, setDestinationThreadId] = useState<ThreadId | null>(null);
  const [sources, setSources] = useState<ReadonlyArray<OrchestrationForwardSource>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    setBusy(true);
    setError(null);
    const result = await resolveSources({
      environmentId: props.environmentId,
      input: {
        sources: [...selectedThreadIds].map((threadId) =>
          threadId === props.sourceThreadId
            ? { threadId, messageId: props.sourceMessageId }
            : { threadId },
        ),
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(failure instanceof Error ? failure.message : "Could not load the responses.");
      return;
    }
    if (result.value.sources.length === 0) {
      setError("No selected thread has a completed final response.");
      return;
    }
    setSources(result.value.sources);
    setStep("review");
  };

  const send = async () => {
    const destination = candidates.find((thread) => thread.id === destinationThreadId);
    if (!destination) return;
    setBusy(true);
    setError(null);
    const createdAt = new Date().toISOString();
    const result = await startTurn({
      environmentId: destination.environmentId,
      input: {
        threadId: destination.id,
        message: {
          messageId: MessageId.make(uuidv4()),
          role: "user",
          text: compileForwardedResponses(sources),
          attachments: [],
        },
        modelSelection: destination.modelSelection,
        titleSeed: destination.title,
        runtimeMode: destination.runtimeMode,
        interactionMode: destination.interactionMode,
        createdAt,
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(failure instanceof Error ? failure.message : "Could not forward the responses.");
      return;
    }
    props.onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <View className="flex-1 justify-end bg-backdrop">
        <Pressable
          className="flex-1"
          accessibilityLabel="Close forwarding"
          onPress={props.onClose}
        />
        <View
          className="max-h-[86%] rounded-t-[28px] bg-card px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="mb-3 flex-row items-center gap-2">
            {step === "review" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="size-10 items-center justify-center rounded-full active:bg-subtle"
                onPress={() => setStep("sources")}
              >
                <IconArrowLeft size={20} />
              </Pressable>
            ) : null}
            <View className="min-w-0 flex-1">
              <AppText className="text-lg font-t3-semibold">Forward response</AppText>
              <AppText className="text-sm text-foreground-secondary">
                {step === "sources" ? "Choose source threads" : "Review and choose a destination"}
              </AppText>
            </View>
          </View>
          <ScrollView className="max-h-[58vh]" contentContainerClassName="gap-1 pb-2">
            {step === "sources" ? (
              candidates.map((thread) => {
                const pinned = thread.id === props.sourceThreadId;
                const selected = selectedThreadIds.has(thread.id);
                return (
                  <Pressable
                    key={thread.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: pinned }}
                    disabled={pinned}
                    onPress={() =>
                      setSelectedThreadIds((current) => {
                        const nextIds = new Set(current);
                        if (nextIds.has(thread.id)) nextIds.delete(thread.id);
                        else nextIds.add(thread.id);
                        return nextIds;
                      })
                    }
                    className="min-h-12 flex-row items-center gap-3 rounded-2xl px-3 active:bg-subtle"
                  >
                    <View className="size-5 items-center justify-center rounded-md border border-adaptive-neutral-300-700">
                      {selected ? <IconCheck size={14} /> : null}
                    </View>
                    <AppText numberOfLines={1} className="min-w-0 flex-1">
                      {thread.title}
                    </AppText>
                    {pinned ? (
                      <AppText className="text-xs text-foreground-secondary">
                        Selected response
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })
            ) : (
              <>
                {sources.map((source) => (
                  <View
                    key={`${source.threadId}:${source.messageId}`}
                    className="rounded-2xl bg-subtle p-3"
                  >
                    <AppText className="font-t3-semibold">{source.title}</AppText>
                    <AppText numberOfLines={5} className="mt-1 text-sm text-foreground-secondary">
                      {source.text}
                    </AppText>
                  </View>
                ))}
                <AppText className="mt-3 mb-1 font-t3-semibold">Send to</AppText>
                {candidates.map((thread) => (
                  <Pressable
                    key={thread.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: destinationThreadId === thread.id }}
                    onPress={() => setDestinationThreadId(thread.id)}
                    className="min-h-12 flex-row items-center gap-3 rounded-2xl px-3 active:bg-subtle"
                  >
                    <View className="size-5 items-center justify-center rounded-full border border-adaptive-neutral-300-700">
                      {destinationThreadId === thread.id ? (
                        <View className="size-2.5 rounded-full bg-foreground" />
                      ) : null}
                    </View>
                    <AppText numberOfLines={1} className="min-w-0 flex-1">
                      {thread.title}
                    </AppText>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
          {error ? (
            <AppText accessibilityRole="alert" className="mt-2 text-sm text-danger-foreground">
              {error}
            </AppText>
          ) : null}
          <View className="mt-3 flex-row justify-end gap-2">
            <Pressable
              onPress={props.onClose}
              className="min-h-11 justify-center rounded-full px-4 active:bg-subtle"
            >
              <AppText className="font-t3-medium">Cancel</AppText>
            </Pressable>
            <Pressable
              disabled={busy || (step === "review" && destinationThreadId === null)}
              onPress={() => void (step === "sources" ? next() : send())}
              className="min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-foreground px-5 disabled:opacity-40"
            >
              {busy ? (
                <ActivityIndicator size="small" color="white" />
              ) : step === "review" ? (
                <IconSend size={17} color="white" />
              ) : null}
              <AppText className="font-t3-semibold text-background">
                {step === "sources" ? "Next" : "Send"}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
