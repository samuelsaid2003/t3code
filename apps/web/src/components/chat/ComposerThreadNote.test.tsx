import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerThreadNoteBadge, ComposerThreadNoteDrawer } from "./ComposerThreadNote";
import { threadNoteKeyIntent } from "./ComposerThreadNote.logic";

describe("ComposerThreadNote", () => {
  it("renders a compact composer shoulder with a note preview", () => {
    const markup = renderToStaticMarkup(
      <ComposerThreadNoteBadge
        expanded={false}
        placement="rail"
        preview="Follow up after release"
        status="saved"
        onToggle={() => undefined}
      />,
    );

    expect(markup).toContain('data-composer-thread-note-badge="true"');
    expect(markup).toContain("chat-composer-shoulder-tab");
    expect(markup).toContain("cursor-pointer");
    expect(markup).toContain("Follow up after release");
    expect(markup).toContain("lucide-chevron-up");
    expect(markup).not.toContain("lucide-sticky-note");
  });

  it("points the shoulder down while the note is open", () => {
    const markup = renderToStaticMarkup(
      <ComposerThreadNoteBadge
        expanded
        placement="rail"
        preview=""
        status="saved"
        onToggle={() => undefined}
      />,
    );

    expect(markup).toContain("lucide-chevron-down");
    expect(markup).not.toContain("lucide-chevron-up");
  });

  it("renders an editable drawer with local save status", () => {
    const markup = renderToStaticMarkup(
      <ComposerThreadNoteDrawer
        expanded
        text="Keep this visible"
        status="saved"
        onChange={() => undefined}
        onClear={() => undefined}
        onCollapse={() => undefined}
        onKeepMine={() => undefined}
        onRetry={() => undefined}
        onUseLatest={() => undefined}
      />,
    );

    expect(markup).toContain('data-chat-composer-thread-note-drawer="true"');
    expect(markup).toContain("chat-composer-thread-note-overlay");
    expect(markup).toContain("cursor-pointer");
    expect(markup).toContain('aria-label="Thread note"');
    expect(markup).toContain("Keep this visible");
    expect(markup).toContain("Saved");
    expect(markup).toContain("16,000");
    expect(markup).toContain("Enter to save");
    expect(markup).toContain('aria-label="Clear and close thread note"');
    expect(markup).toContain("lucide-trash-2");
    expect(markup).toContain("lucide-chevron-down");
    expect(markup).not.toContain("lucide-sticky-note");
    expect(markup).not.toContain("lucide-check");
  });

  it("offers an explicit choice instead of overwriting a concurrent edit", () => {
    const markup = renderToStaticMarkup(
      <ComposerThreadNoteDrawer
        expanded
        text="My draft"
        status="conflict"
        onChange={() => undefined}
        onClear={() => undefined}
        onCollapse={() => undefined}
        onKeepMine={() => undefined}
        onRetry={() => undefined}
        onUseLatest={() => undefined}
      />,
    );

    expect(markup).toContain("changed in another T3S window");
    expect(markup).toContain("Use latest");
    expect(markup).toContain("Keep mine");
  });

  it("submits on Enter and preserves Shift+Enter for new lines", () => {
    expect(threadNoteKeyIntent({ key: "Enter", shiftKey: false, isComposing: false })).toBe(
      "submit",
    );
    expect(threadNoteKeyIntent({ key: "Enter", shiftKey: true, isComposing: false })).toBe(
      "newline",
    );
    expect(threadNoteKeyIntent({ key: "Enter", shiftKey: false, isComposing: true })).toBe("none");
  });
});
