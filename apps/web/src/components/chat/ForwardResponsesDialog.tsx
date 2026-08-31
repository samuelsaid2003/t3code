import type {
  EnvironmentId,
  MessageId,
  OrchestrationForwardSource,
  ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useMemo, useState } from "react";
import { ArrowLeftIcon, ForwardIcon } from "lucide-react";

import { orchestrationEnvironment } from "~/state/orchestration";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { compileForwardedResponses } from "~/forwardResponses";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

interface ForwardResponsesDialogProps {
  readonly environmentId: EnvironmentId;
  readonly sourceThreadId: ThreadId;
  readonly sourceMessageId: MessageId;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onClose: () => void;
  readonly onSend: (destination: EnvironmentThreadShell, text: string) => Promise<string | null>;
}

type ForwardStep = "sources" | "review";

export function ForwardResponsesDialog(props: ForwardResponsesDialogProps) {
  const resolveSources = useAtomQueryRunner(orchestrationEnvironment.forwardSources, {
    reportFailure: false,
  });
  const candidates = useMemo(
    () =>
      props.threads
        .filter(
          (thread) =>
            thread.environmentId === props.environmentId &&
            (thread.kind === "standard" || thread.kind === "agent") &&
            thread.archivedAt === null,
        )
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [props.environmentId, props.threads],
  );
  const [step, setStep] = useState<ForwardStep>("sources");
  const [selectedThreadIds, setSelectedThreadIds] = useState<ReadonlySet<ThreadId>>(
    () => new Set([props.sourceThreadId]),
  );
  const [destinationThreadId, setDestinationThreadId] = useState<ThreadId | null>(null);
  const [resolvedSources, setResolvedSources] = useState<ReadonlyArray<OrchestrationForwardSource>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const continueToReview = async () => {
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
      setError("None of the selected threads has a completed final response to forward.");
      return;
    }
    setResolvedSources(result.value.sources);
    setStep("review");
  };

  const send = async () => {
    const destination = candidates.find((thread) => thread.id === destinationThreadId);
    if (!destination) {
      setError("Choose a destination thread.");
      return;
    }
    setBusy(true);
    setError(null);
    const sendError = await props.onSend(destination, compileForwardedResponses(resolvedSources));
    setBusy(false);
    if (sendError !== null) {
      setError(sendError);
      return;
    }
    props.onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ForwardIcon className="size-4" /> Forward response
          </DialogTitle>
          <DialogDescription>
            {step === "sources"
              ? "Add recent threads, then review the exact responses before sending."
              : "Choose one destination. This will be sent as a normal user message."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          {step === "sources" ? (
            <div className="space-y-1">
              {candidates.map((thread) => {
                const isPinnedSource = thread.id === props.sourceThreadId;
                const checked = selectedThreadIds.has(thread.id);
                return (
                  <label
                    key={thread.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPinnedSource}
                      onChange={(event) => {
                        setSelectedThreadIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(thread.id);
                          else next.delete(thread.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {isPinnedSource
                        ? "Selected response"
                        : thread.kind === "agent"
                          ? "Agent"
                          : "Thread"}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <>
              {resolvedSources.length < selectedThreadIds.size ? (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground text-xs">
                  {selectedThreadIds.size - resolvedSources.length} selected thread(s) had no
                  completed final response and were omitted.
                </p>
              ) : null}
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border bg-muted/20 p-4">
                {resolvedSources.map((source) => (
                  <section key={`${source.threadId}:${source.messageId}`}>
                    <h3 className="text-sm font-semibold">{source.title}</h3>
                    <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-muted-foreground text-sm">
                      {source.text}
                    </p>
                  </section>
                ))}
              </div>
              <fieldset className="space-y-1">
                <legend className="mb-2 text-sm font-medium">Send to</legend>
                {candidates.map((thread) => (
                  <label
                    key={thread.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60"
                  >
                    <input
                      type="radio"
                      name="forward-destination"
                      checked={destinationThreadId === thread.id}
                      onChange={() => setDestinationThreadId(thread.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          {step === "review" ? (
            <Button variant="ghost" onClick={() => setStep("sources")} disabled={busy}>
              <ArrowLeftIcon className="size-4" /> Back
            </Button>
          ) : null}
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            Cancel
          </Button>
          {step === "sources" ? (
            <Button onClick={() => void continueToReview()} disabled={busy}>
              Next
            </Button>
          ) : (
            <Button onClick={() => void send()} disabled={busy || destinationThreadId === null}>
              Send
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
