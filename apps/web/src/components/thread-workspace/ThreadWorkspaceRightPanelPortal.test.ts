import { describe, expect, it } from "vite-plus/test";

import { updateThreadWorkspaceRightPanelPresentation } from "./ThreadWorkspaceRightPanelPortal";

describe("thread workspace right panel presentation", () => {
  it("follows the latest focused thread", () => {
    expect(updateThreadWorkspaceRightPanelPresentation(null, "thread-a", false)).toEqual({
      ownerKey: "thread-a",
      maximized: false,
    });
    expect(
      updateThreadWorkspaceRightPanelPresentation(
        { ownerKey: "thread-a", maximized: false },
        "thread-b",
        true,
      ),
    ).toEqual({ ownerKey: "thread-b", maximized: true });
  });

  it("ignores cleanup from a previously focused thread", () => {
    const current = { ownerKey: "thread-b", maximized: false } as const;
    expect(updateThreadWorkspaceRightPanelPresentation(current, "thread-a", null)).toBe(current);
  });

  it("clears presentation when the current owner closes its panel", () => {
    expect(
      updateThreadWorkspaceRightPanelPresentation(
        { ownerKey: "thread-a", maximized: true },
        "thread-a",
        null,
      ),
    ).toBeNull();
  });
});
