import { SlackIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import type { TimelineSourceFilter, TimelineSourcePresentation } from "./slackTimelineFilter.logic";

export function SlackTimelineFilter({
  onChange,
  presentation,
  value,
}: {
  readonly onChange: (value: TimelineSourceFilter) => void;
  readonly presentation: TimelineSourcePresentation;
  readonly value: TimelineSourceFilter;
}) {
  const status =
    value === "all"
      ? `${presentation.slackTurnCount} from Slack`
      : `${presentation.hiddenTurnCount} ${value === "slack" ? "T3" : "Slack"} ${presentation.hiddenTurnCount === 1 ? "turn" : "turns"} hidden`;

  return (
    <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-b border-border/45 px-3 sm:px-5">
      <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
        <SlackIcon className="size-3" aria-hidden="true" />
        {status}
      </span>
      <ToggleGroup
        aria-label="Conversation source"
        onValueChange={(values) => {
          const next = values[0];
          if (next === "all" || next === "t3" || next === "slack") onChange(next);
        }}
        value={[value]}
        variant="segmented"
      >
        <ToggleGroupItem aria-label="Show all conversation turns" value="all">
          All
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Show T3 conversation turns" value="t3">
          T3
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Show Slack conversation turns" value="slack">
          Slack
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
