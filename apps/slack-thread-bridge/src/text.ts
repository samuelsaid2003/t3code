export function splitSlackText(text: string, maximumLength = 3_900): ReadonlyArray<string> {
  const remaining = text.trim() || "T3 completed without returning any text.";
  const chunks: string[] = [];
  let cursor = remaining;

  while (cursor.length > maximumLength) {
    const window = cursor.slice(0, maximumLength + 1);
    const newline = window.lastIndexOf("\n");
    const whitespace = window.lastIndexOf(" ");
    const naturalBreak = Math.max(newline, whitespace);
    const splitAt = naturalBreak >= Math.floor(maximumLength / 2) ? naturalBreak : maximumLength;
    chunks.push(cursor.slice(0, splitAt).trimEnd());
    cursor = cursor.slice(splitAt).trimStart();
  }
  if (cursor.length > 0) chunks.push(cursor);
  return chunks;
}
