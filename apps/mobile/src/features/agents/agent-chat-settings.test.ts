import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";

import { modelSelectionsEqual } from "./agent-chat-settings";

describe("Agent Chat settings", () => {
  it("treats model options and reasoning effort as part of the persisted selection", () => {
    const base = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-terra",
      options: [{ id: "reasoningEffort", value: "high" }],
    };
    expect(modelSelectionsEqual(base, { ...base })).toBe(true);
    expect(
      modelSelectionsEqual(base, {
        ...base,
        options: [{ id: "reasoningEffort", value: "medium" }],
      }),
    ).toBe(false);
  });
});
