import type { EnvironmentThreadSearchMatch } from "@t3tools/client-runtime/state/thread-search";

export interface ChatSearchTarget {
  readonly match: EnvironmentThreadSearchMatch;
  readonly occurrenceIndex: number;
}

const MAX_CHAT_SEARCH_TARGETS = 1_000;

export function expandChatSearchTargets(
  matches: ReadonlyArray<EnvironmentThreadSearchMatch>,
  limit = MAX_CHAT_SEARCH_TARGETS,
): ChatSearchTarget[] {
  const targets: ChatSearchTarget[] = [];
  for (const match of matches) {
    const count = Math.max(1, match.matchCount ?? 1);
    for (
      let occurrenceIndex = 0;
      occurrenceIndex < count && targets.length < limit;
      occurrenceIndex += 1
    ) {
      targets.push({ match, occurrenceIndex });
    }
    if (targets.length >= limit) break;
  }
  return targets;
}
