export interface TextFindMatch {
  readonly offset: number;
  readonly line: number;
}

export function findPlainTextMatches(text: string, query: string, limit = 1_000): TextFindMatch[] {
  const needle = query.toLocaleLowerCase();
  if (needle.length === 0) return [];
  const haystack = text.toLocaleLowerCase();
  const matches: TextFindMatch[] = [];
  let offset = 0;
  let line = 1;
  while (offset <= haystack.length - needle.length && matches.length < limit) {
    const next = haystack.indexOf(needle, offset);
    if (next < 0) break;
    while (offset < next) {
      const code = text.charCodeAt(offset);
      if (code === 10) line += 1;
      else if (code === 13) {
        line += 1;
        if (text.charCodeAt(offset + 1) === 10) offset += 1;
      }
      offset += 1;
    }
    matches.push({ offset: next, line });
    offset = next + Math.max(needle.length, 1);
  }
  return matches;
}
