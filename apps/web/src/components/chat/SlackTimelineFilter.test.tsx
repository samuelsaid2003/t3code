import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SlackTimelineFilter } from "./SlackTimelineFilter";

describe("SlackTimelineFilter", () => {
  it("renders an accessible single-select source control with hidden-turn context", () => {
    const markup = renderToStaticMarkup(
      <SlackTimelineFilter
        value="t3"
        presentation={{
          entries: [],
          hiddenTurnCount: 2,
          latestSource: "slack",
          slackTurnCount: 2,
          t3TurnCount: 3,
        }}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Conversation source"');
    expect(markup).toContain("2 Slack turns hidden");
    expect(markup).toContain('aria-label="Show all conversation turns"');
    expect(markup).toContain('aria-label="Show T3 conversation turns"');
    expect(markup).toContain('aria-label="Show Slack conversation turns"');
  });
});
