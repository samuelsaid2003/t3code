export function threadNoteKeyIntent(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): "submit" | "newline" | "none" {
  if (input.key !== "Enter" || input.isComposing) return "none";
  return input.shiftKey ? "newline" : "submit";
}
