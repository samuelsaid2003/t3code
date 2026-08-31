import type { EnvironmentThreadSearchMatch } from "@t3tools/client-runtime/state/thread-search";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../ui/button";
import { cn } from "~/lib/utils";

interface ChatSearchBarProps {
  readonly query: string;
  readonly matches: ReadonlyArray<EnvironmentThreadSearchMatch>;
  readonly activeIndex: number;
  readonly isPending: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onSelectIndex: (index: number) => void;
  readonly onClose: () => void;
}

export function ChatSearchBar(props: ChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const move = (delta: number) => {
    if (props.matches.length === 0) return;
    const base = props.activeIndex < 0 ? (delta > 0 ? -1 : 0) : props.activeIndex;
    props.onSelectIndex((base + delta + props.matches.length) % props.matches.length);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-xl">
        <div className="flex h-11 items-center gap-2 px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
              } else if (event.key === "Enter") {
                event.preventDefault();
                move(event.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search chat…"
            aria-label="Search chat"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="min-w-16 text-right text-muted-foreground text-xs tabular-nums">
            {props.isPending
              ? "Searching…"
              : props.query.trim().length < 2
                ? "Type 2+"
                : props.matches.length === 0
                  ? "No matches"
                  : `${props.activeIndex + 1} / ${props.matches.length}`}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Previous match"
            onClick={() => move(-1)}
          >
            <ChevronUpIcon className="size-3.5" />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Next match" onClick={() => move(1)}>
            <ChevronDownIcon className="size-3.5" />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Close search" onClick={props.onClose}>
            <XIcon className="size-3.5" />
          </Button>
        </div>
        {props.matches.length > 0 ? (
          <div className="max-h-52 overflow-y-auto border-t border-border/60 p-1">
            {props.matches.map((match, index) => (
              <button
                key={match.messageId}
                type="button"
                onClick={() => props.onSelectIndex(index)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs",
                  index === props.activeIndex ? "bg-primary/10" : "hover:bg-muted/60",
                )}
              >
                <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                  {match.source}
                </span>
                <span className="line-clamp-2 text-muted-foreground">{match.snippet}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
