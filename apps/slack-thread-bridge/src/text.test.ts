import { describe, expect, it } from "vite-plus/test";

import { splitSlackText } from "./text.ts";

describe("splitSlackText", () => {
  it("keeps short replies intact", () => {
    expect(splitSlackText("hello")).toEqual(["hello"]);
  });

  it("bounds every Slack message chunk", () => {
    const chunks = splitSlackText(`first line\n${"word ".repeat(30)}`, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join(" ").replaceAll(/\s+/g, " ").trim()).toBe(
      `first line ${"word ".repeat(30)}`.replaceAll(/\s+/g, " ").trim(),
    );
  });

  it("provides a useful fallback for an empty response", () => {
    expect(splitSlackText("   ")).toEqual(["T3 completed without returning any text."]);
  });
});
