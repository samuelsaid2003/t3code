import { describe, expect, it } from "vite-plus/test";

import { mcpCapabilitiesForThread } from "./ProviderCommandReactor.ts";

describe("mcpCapabilitiesForThread", () => {
  it("grants only explicitly enabled Agent Chat capabilities", () => {
    expect([
      ...mcpCapabilitiesForThread({
        kind: "agent",
        agentProfile: {
          instructions: "Be useful",
          allowRoutineManagement: true,
          allowTaskManagement: false,
        },
      }),
    ]).toEqual(["agent-routines"]);
    expect([
      ...mcpCapabilitiesForThread({
        kind: "agent",
        agentProfile: {
          instructions: "Be useful",
          allowRoutineManagement: true,
          allowTaskManagement: true,
        },
      }),
    ]).toEqual(["agent-routines", "task-management"]);
  });

  it("never grants routine or task authority to standard and side threads", () => {
    for (const kind of ["standard", "side"] as const) {
      expect(
        mcpCapabilitiesForThread({
          kind,
          agentProfile: {
            instructions: "Legacy malformed profile",
            allowRoutineManagement: true,
            allowTaskManagement: true,
          },
        }).size,
      ).toBe(0);
    }
  });
});
