import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../ui/button";

interface ChatSearchBarProps {
  readonly query: string;
  readonly matchCount: number;
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
    if (props.matchCount === 0) return;
    const base = props.activeIndex < 0 ? (delta > 0 ? -1 : 0) : props.activeIndex;
    props.onSelectIndex((base + delta + props.matchCount) % props.matchCount);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex h-10 w-full max-w-lg items-center gap-2 rounded-xl border border-border/70 bg-background/95 px-2.5 shadow-xl backdrop-blur-xl">
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
        <span className="min-w-16 text-right text-xs tabular-nums text-muted-foreground">
          {props.isPending
            ? "Searching…"
            : props.query.trim().length < 2
              ? "Type 2+"
              : props.matchCount === 0
                ? "No matches"
                : `${props.activeIndex + 1} / ${props.matchCount}`}
        </span>
        <Button aria-label="Previous match" onClick={() => move(-1)} size="icon-xs" variant="ghost">
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <Button aria-label="Next match" onClick={() => move(1)} size="icon-xs" variant="ghost">
          <ChevronDownIcon className="size-3.5" />
        </Button>
        <Button aria-label="Close search" onClick={props.onClose} size="icon-xs" variant="ghost">
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
