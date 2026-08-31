import type { OrchestrationForwardSource } from "@t3tools/contracts";

export function compileForwardedResponses(
  sources: ReadonlyArray<OrchestrationForwardSource>,
): string {
  return [
    "Forwarded responses",
    ...sources.flatMap((source) => [`## ${source.title}`, source.text.trim()]),
  ].join("\n\n");
}
