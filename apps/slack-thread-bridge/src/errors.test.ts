import { describe, expect, it } from "vite-plus/test";

import { safeErrorMessage } from "./errors.ts";

describe("safeErrorMessage", () => {
  it("redacts T3 tickets and Slack or bearer tokens from runtime logs", () => {
    expect(
      safeErrorMessage(
        new Error("ws://127.0.0.1/ws?wsTicket=short-secret xoxb-long-secret Bearer access.secret"),
      ),
    ).toBe("ws://127.0.0.1/ws?wsTicket=[redacted] [redacted] [redacted]");
  });
});
