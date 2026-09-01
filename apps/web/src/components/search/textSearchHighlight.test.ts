import { describe, expect, it } from "vite-plus/test";

import { findTextSearchOffsets } from "./useDomTextSearchHighlight";

describe("findTextSearchOffsets", () => {
  it("finds every non-overlapping occurrence without case sensitivity", () => {
    expect(findTextSearchOffsets("Response forwarding response", "response")).toEqual([0, 20]);
  });

  it("honors its result limit and ignores an empty query", () => {
    expect(findTextSearchOffsets("task task task", "task", 2)).toEqual([0, 5]);
    expect(findTextSearchOffsets("task", "")).toEqual([]);
  });
});
