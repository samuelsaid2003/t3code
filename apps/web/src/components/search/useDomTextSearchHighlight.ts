import { useEffect } from "react";

const HIGHLIGHT_NAME = "t3-text-search";
const HIGHLIGHT_STYLE_ID = "t3-text-search-highlight-style";
const MAX_HIGHLIGHT_RANGES = 1_000;
const rangeGroups = new Map<symbol, ReadonlyArray<Range>>();

interface HighlightRegistry {
  delete(name: string): void;
  set(name: string, highlight: unknown): void;
}

interface HighlightConstructor {
  new (...ranges: ReadonlyArray<Range>): unknown;
}

function highlightApi(): {
  readonly registry: HighlightRegistry;
  readonly Highlight: HighlightConstructor;
} | null {
  const registry = (globalThis.CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights;
  const Highlight = (globalThis as typeof globalThis & { Highlight?: HighlightConstructor })
    .Highlight;
  return registry && Highlight ? { registry, Highlight } : null;
}

function publishRanges() {
  const api = highlightApi();
  if (!api) return;
  const ranges = [...rangeGroups.values()].flat();
  if (ranges.length === 0) {
    api.registry.delete(HIGHLIGHT_NAME);
    return;
  }
  api.registry.set(HIGHLIGHT_NAME, new api.Highlight(...ranges));
}

function ensureHighlightStyles() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent =
    "::highlight(t3-text-search) { background: rgb(250 180 40 / 55%); color: inherit; }";
  document.head.append(style);
}

export function collectTextSearchRanges(
  root: HTMLElement,
  query: string,
  limit = MAX_HIGHLIGHT_RANGES,
): Range[] {
  const needle = query.toLocaleLowerCase();
  if (needle.length === 0) return [];
  const ranges: Range[] = [];
  const searchRoots: Node[] = [root];
  for (let index = 0; index < searchRoots.length; index += 1) {
    const searchRoot = searchRoots[index]!;
    if ("querySelectorAll" in searchRoot) {
      for (const element of (searchRoot as ParentNode).querySelectorAll("*")) {
        if (element.shadowRoot) searchRoots.push(element.shadowRoot);
      }
    }
    const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(
            "input,textarea,select,button,[contenteditable='true'],[data-text-find-ui='true']",
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    for (let node = walker.nextNode(); node && ranges.length < limit; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const match of findTextSearchOffsets(text, needle, limit - ranges.length)) {
        const range = document.createRange();
        range.setStart(node, match);
        range.setEnd(node, match + needle.length);
        ranges.push(range);
      }
    }
    if (ranges.length >= limit) break;
  }
  return ranges;
}

export function revealTextSearchRange(range: Range): boolean {
  const element = range.startContainer.parentElement;
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  return true;
}

export function findTextSearchOffsets(text: string, query: string, limit = 1_000): number[] {
  const needle = query.toLocaleLowerCase();
  if (needle.length === 0) return [];
  const haystack = text.toLocaleLowerCase();
  const offsets: number[] = [];
  let offset = 0;
  while (offset <= haystack.length - needle.length && offsets.length < limit) {
    const match = haystack.indexOf(needle, offset);
    if (match < 0) break;
    offsets.push(match);
    offset = match + needle.length;
  }
  return offsets;
}

export function useDomTextSearchHighlight(root: HTMLElement | null, query: string) {
  useEffect(() => {
    if (!root || query.length === 0 || highlightApi() === null) return;
    ensureHighlightStyles();
    const groupId = Symbol(HIGHLIGHT_NAME);
    let frame: number | null = null;

    const refresh = () => {
      rangeGroups.set(groupId, collectTextSearchRanges(root, query));
      publishRanges();
    };
    const scheduleRefresh = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        refresh();
      });
    };

    scheduleRefresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(root, { characterData: true, childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      rangeGroups.delete(groupId);
      publishRanges();
    };
  }, [query, root]);
}

export function useDomTextSearchNavigation(
  root: HTMLElement | null,
  query: string,
  activeIndex: number,
) {
  useEffect(() => {
    if (!root || query.length === 0 || activeIndex < 0) return;
    let frame: number | null = null;
    let attempts = 0;
    const reveal = () => {
      frame = null;
      const range = collectTextSearchRanges(root, query)[activeIndex];
      if (range && revealTextSearchRange(range)) return;
      attempts += 1;
      if (attempts < 30) frame = requestAnimationFrame(reveal);
    };
    frame = requestAnimationFrame(reveal);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [activeIndex, query, root]);
}
