import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type {
  EnvironmentId,
  MessageId,
  OrchestrationForwardSource,
  ThreadId,
} from "@t3tools/contracts";
import { ArrowLeftIcon, ForwardIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { compileForwardedResponses } from "~/forwardResponses";
import { orchestrationEnvironment } from "~/state/orchestration";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { Button } from "../ui/button";
import { Popover, PopoverDescription, PopoverPopup, PopoverTitle } from "../ui/popover";

interface ForwardResponsesDialogProps {
  readonly anchor: HTMLElement;
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
    <Popover open onOpenChange={(open) => !open && props.onClose()}>
      <PopoverPopup
        align="end"
        anchor={props.anchor}
        className="w-[24rem] max-w-[calc(100vw-2rem)]"
        side="top"
        sideOffset={8}
        viewportClassName="p-0"
      >
        <div className="border-b px-3 py-2.5">
          <PopoverTitle className="flex items-center gap-2 text-sm font-semibold">
            <ForwardIcon className="size-3.5" /> Forward response
          </PopoverTitle>
          <PopoverDescription className="mt-0.5 text-[11px] text-muted-foreground">
            {step === "sources"
              ? "Include responses from recent threads."
              : "Review, choose a destination, then send."}
          </PopoverDescription>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {step === "sources" ? (
            <div className="space-y-0.5">
              {candidates.map((thread) => {
                const isPinnedSource = thread.id === props.sourceThreadId;
                const checked = selectedThreadIds.has(thread.id);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                    key={thread.id}
                  >
                    <input
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
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {isPinnedSource
                        ? "This response"
                        : thread.kind === "agent"
                          ? "Agent"
                          : "Thread"}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 p-1">
              {resolvedSources.length < selectedThreadIds.size ? (
                <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                  {selectedThreadIds.size - resolvedSources.length} selection(s) had no completed
                  response and were omitted.
                </p>
              ) : null}
              <div className="space-y-2 rounded-md border bg-muted/15 p-2.5">
                {resolvedSources.map((source) => (
                  <section key={`${source.threadId}:${source.messageId}`}>
                    <h3 className="truncate text-xs font-semibold">{source.title}</h3>
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">
                      {source.text}
                    </p>
                  </section>
                ))}
              </div>
              <fieldset className="space-y-0.5">
                <legend className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                  Send to
                </legend>
                {candidates.map((thread) => (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                    key={thread.id}
                  >
                    <input
                      checked={destinationThreadId === thread.id}
                      name="forward-destination"
                      onChange={() => setDestinationThreadId(thread.id)}
                      type="radio"
                    />
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}
          {error ? (
            <p className="px-2 py-1.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-1 border-t p-2">
          {step === "review" ? (
            <Button disabled={busy} onClick={() => setStep("sources")} size="xs" variant="ghost">
              <ArrowLeftIcon className="size-3.5" /> Back
            </Button>
          ) : null}
          <Button disabled={busy} onClick={props.onClose} size="xs" variant="ghost">
            Cancel
          </Button>
          {step === "sources" ? (
            <Button disabled={busy} onClick={() => void continueToReview()} size="xs">
              Next
            </Button>
          ) : (
            <Button
              disabled={busy || destinationThreadId === null}
              onClick={() => void send()}
              size="xs"
            >
              Send
            </Button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
