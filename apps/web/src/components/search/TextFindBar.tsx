import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../ui/button";

interface TextFindBarProps {
  readonly label: string;
  readonly placeholder: string;
  readonly query: string;
  readonly matchCount: number;
  readonly activeIndex: number;
  readonly onQueryChange: (query: string) => void;
  readonly onMove: (delta: number) => void;
  readonly onClose: () => void;
}

export function TextFindBar(props: TextFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="absolute top-2 right-3 z-50 flex h-10 w-[min(28rem,calc(100%-1.5rem))] items-center gap-2 rounded-xl border border-border/70 bg-background/95 px-2.5 shadow-xl backdrop-blur-xl">
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
            props.onMove(event.shiftKey ? -1 : 1);
          }
        }}
        aria-label={props.label}
        placeholder={props.placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <span className="min-w-14 text-right text-muted-foreground text-xs tabular-nums">
        {props.query.length === 0
          ? "0 / 0"
          : props.matchCount === 0
            ? "No matches"
            : `${props.activeIndex + 1} / ${props.matchCount}`}
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Previous match"
        onClick={() => props.onMove(-1)}
      >
        <ChevronUpIcon className="size-3.5" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Next match"
        onClick={() => props.onMove(1)}
      >
        <ChevronDownIcon className="size-3.5" />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Close find" onClick={props.onClose}>
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
