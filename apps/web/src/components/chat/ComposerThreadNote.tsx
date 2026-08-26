import { ChevronDownIcon, ChevronUpIcon, RefreshCcwIcon, Trash2Icon } from "lucide-react";
import { memo } from "react";

import {
  DESKTOP_THREAD_NOTE_MAX_LENGTH,
  type DesktopThreadNoteSaveStatus,
} from "../../desktopThreadNotesStore";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { threadNoteKeyIntent } from "./ComposerThreadNote.logic";

function saveStatusLabel(status: DesktopThreadNoteSaveStatus) {
  switch (status) {
    case "saving":
      return "Saving…";
    case "conflict":
      return "Changed elsewhere";
    case "error":
      return "Retry save";
    case "saved":
      return "Saved";
  }
}

export const ComposerThreadNoteBadge = memo(function ComposerThreadNoteBadge(props: {
  readonly expanded: boolean;
  readonly placement?: "inline" | "rail";
  readonly preview: string;
  readonly status: DesktopThreadNoteSaveStatus;
  readonly onToggle: () => void;
}) {
  const inline = props.placement === "inline";
  const label = props.preview ? `Thread note: ${props.preview}` : "Add a note to this thread";
  if (inline) {
    return (
      <Button
        size="micro"
        variant="ghost-muted"
        aria-expanded={props.expanded}
        aria-label={label}
        className={cn(
          "shrink-0 gap-1 px-1.5",
          props.expanded && "[--control-icon-color:currentColor] text-foreground",
        )}
        data-composer-thread-note-badge="true"
        onClick={props.onToggle}
        onPointerDown={(event) => event.preventDefault()}
      >
        {props.expanded ? (
          <ChevronDownIcon aria-hidden className="size-3 shrink-0" />
        ) : (
          <ChevronUpIcon aria-hidden className="size-3 shrink-0" />
        )}
        <span>Note</span>
        {props.preview ? <span className="size-1 rounded-full bg-warning" aria-hidden /> : null}
      </Button>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      aria-label={label}
      className={cn(
        "chat-composer-shoulder-tab flex h-8 min-w-0 max-w-[45%] shrink cursor-pointer items-center gap-1.5 rounded-t-xl border border-b-0 px-2.5 pb-1 text-xs leading-none",
        "text-muted-foreground transition-[color,border-color] duration-200 hover:text-foreground",
        props.expanded && "text-foreground",
      )}
      data-composer-thread-note-badge="true"
      onClick={props.onToggle}
      onPointerDown={(event) => event.preventDefault()}
    >
      {props.expanded ? (
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <ChevronUpIcon aria-hidden className="size-3.5 shrink-0" />
      )}
      <span className="shrink-0">Note</span>
      {props.preview ? (
        <span className="min-w-0 truncate text-foreground/65">{props.preview}</span>
      ) : (
        <span className="min-w-0 truncate text-muted-foreground/50">Add note</span>
      )}
      {props.status !== "saved" ? (
        <span
          className={cn(
            "ml-auto size-1.5 shrink-0 rounded-full",
            props.status === "error" ? "bg-error" : "bg-warning/70",
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );
});

export const ComposerThreadNoteDrawer = memo(function ComposerThreadNoteDrawer(props: {
  readonly expanded: boolean;
  readonly text: string;
  readonly status: DesktopThreadNoteSaveStatus;
  readonly onChange: (text: string) => void;
  readonly onClear: () => void;
  readonly onCollapse: () => void;
  readonly onKeepMine: () => void;
  readonly onRetry: () => void;
  readonly onUseLatest: () => void;
}) {
  return (
    <div
      className="chat-composer-top-drawer chat-composer-thread-note-overlay"
      aria-hidden={!props.expanded}
      data-chat-composer-thread-note-drawer="true"
      data-state={props.expanded ? "open" : "closed"}
      data-variant={props.status === "error" ? "error" : undefined}
      inert={!props.expanded}
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 sm:px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={props.expanded}
          onClick={props.onCollapse}
          onPointerDown={(event) => event.preventDefault()}
        >
          <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="font-medium text-foreground">Note</span>
        </button>
        <span
          className={cn(
            "text-[10px] tabular-nums",
            props.status === "error" || props.status === "conflict"
              ? "text-warning"
              : "text-muted-foreground/55",
          )}
          aria-live="polite"
        >
          {saveStatusLabel(props.status)}
        </span>
        <Button
          size="icon-micro"
          variant="ghost-muted"
          aria-label="Clear and close thread note"
          onClick={props.onClear}
          onPointerDown={(event) => event.preventDefault()}
        >
          <Trash2Icon aria-hidden className="size-3" />
        </Button>
      </div>
      <div className="px-3 pb-4 sm:px-4">
        <textarea
          value={props.text}
          maxLength={DESKTOP_THREAD_NOTE_MAX_LENGTH}
          rows={4}
          aria-label="Thread note"
          placeholder="Leave a note for this thread…"
          className="min-h-20 max-h-44 w-full resize-y rounded-xl border border-border/55 bg-background/45 px-3 py-2 text-sm leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-warning/40 focus:bg-background/65"
          onBlur={props.onRetry}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              props.onCollapse();
              return;
            }
            if (
              threadNoteKeyIntent({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
              }) === "submit"
            ) {
              event.preventDefault();
              props.onCollapse();
            }
          }}
        />
        {props.status === "conflict" ? (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1">This note changed in another T3S window.</span>
            <Button size="micro" variant="ghost-muted" onClick={props.onUseLatest}>
              Use latest
            </Button>
            <Button size="micro" variant="ghost-muted" onClick={props.onKeepMine}>
              Keep mine
            </Button>
          </div>
        ) : props.status === "error" ? (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-error hover:underline"
            onClick={props.onRetry}
          >
            <RefreshCcwIcon aria-hidden className="size-3" />
            Couldn’t save locally. Try again.
          </button>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground/40">
            <span>Enter to save · Shift+Enter for a new line</span>
            <span className="shrink-0 tabular-nums">
              {props.text.length.toLocaleString()}/{DESKTOP_THREAD_NOTE_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
