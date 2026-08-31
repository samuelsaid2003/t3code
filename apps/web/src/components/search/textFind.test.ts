import { describe, expect, it } from "vite-plus/test";

import { findPlainTextMatches } from "./textFind";

describe("findPlainTextMatches", () => {
  it("finds case-insensitive matches and reports one-based lines", () => {
    expect(findPlainTextMatches("Alpha\nbeta ALPHA", "alpha")).toEqual([
      { offset: 0, line: 1 },
      { offset: 11, line: 2 },
    ]);
  });
});
