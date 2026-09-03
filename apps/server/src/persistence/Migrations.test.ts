import { assert, describe, it } from "@effect/vitest";

import { migrationManifest } from "./Migrations.ts";

describe("migration manifest", () => {
  it("keeps fork migrations durable and appends colliding upstream migrations", () => {
    assert.deepStrictEqual(migrationManifest.slice(-9), [
      [44, "AgentChats"],
      [45, "AgentRoutineMessageSource"],
      [46, "SideChats"],
      [47, "MessageExternalDelivery"],
      [48, "Tasks"],
      [49, "ClearAutomaticProjectModelDefaults"],
      [50, "ProjectionProjectsAutoPull"],
      [51, "RepairAutomaticSettlementTimestamps"],
      [52, "ProjectionProjectIcon"],
    ]);
  });
});
