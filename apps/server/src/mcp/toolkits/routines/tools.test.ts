import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { FriendlyRoutineSchedule } from "./tools.ts";

const decodeSchedule = Schema.decodeUnknownEffect(FriendlyRoutineSchedule);

describe("FriendlyRoutineSchedule", () => {
  it("accepts model-friendly wall-clock schedules", async () => {
    await expect(
      Effect.runPromise(
        decodeSchedule({
          kind: "weekly",
          weekDay: 1,
          time: "08:00",
          timeZone: "Australia/Melbourne",
        }),
      ),
    ).resolves.toMatchObject({ kind: "weekly", time: "08:00" });
  });

  it("rejects invalid time and weekday values", async () => {
    const invalidTime = await Effect.runPromiseExit(
      decodeSchedule({ kind: "daily", time: "25:00", timeZone: "UTC" }),
    );
    const invalidWeekday = await Effect.runPromiseExit(
      decodeSchedule({ kind: "weekly", weekDay: 7, time: "08:00", timeZone: "UTC" }),
    );
    expect(Exit.isFailure(invalidTime)).toBe(true);
    expect(Exit.isFailure(invalidWeekday)).toBe(true);
  });
});
