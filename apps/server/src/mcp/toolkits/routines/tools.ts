import {
  AgentRoutine,
  AgentRoutineId,
  IsoDateTime,
  PreviewAutomationUnavailableError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Crypto from "effect/Crypto";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  OrchestrationEngineService,
  ProjectionSnapshotQuery,
  Crypto.Crypto,
];

const TimeOfDay = Schema.String.check(Schema.isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/));
const TimeZone = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100));

export const FriendlyRoutineSchedule = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("once"),
    at: IsoDateTime,
    timeZone: TimeZone,
  }),
  Schema.Struct({
    kind: Schema.Literal("daily"),
    time: TimeOfDay,
    timeZone: TimeZone,
  }),
  Schema.Struct({
    kind: Schema.Literal("weekly"),
    weekDay: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
    time: TimeOfDay,
    timeZone: TimeZone,
  }),
  Schema.Struct({
    kind: Schema.Literal("monthly"),
    monthDay: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 })),
    time: TimeOfDay,
    timeZone: TimeZone,
  }),
]);
export type FriendlyRoutineSchedule = typeof FriendlyRoutineSchedule.Type;

export class AgentRoutineToolError extends Schema.TaggedErrorClass<AgentRoutineToolError>()(
  "AgentRoutineToolError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

const RoutineToolFailure = Schema.Union([AgentRoutineToolError, PreviewAutomationUnavailableError]);
const RoutineListResult = Schema.Struct({ routines: Schema.Array(AgentRoutine) });
const RoutineDeleteResult = Schema.Struct({ routineId: AgentRoutineId, deleted: Schema.Boolean });
const RoutineRunResult = Schema.Struct({
  routine: AgentRoutine,
  runId: Schema.String,
  scheduledFor: IsoDateTime,
});

export const RoutineListTool = Tool.make("routine_list", {
  description:
    "List this Agent Chat's routines, including their normalized schedules, enabled state, and next run time.",
  parameters: Schema.Struct({}),
  success: RoutineListResult,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "List agent routines")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const RoutineCreateTool = Tool.make("routine_create", {
  description:
    "Create a routine for this Agent Chat. Weekly weekDay uses 0=Sunday through 6=Saturday. Times use 24-hour HH:mm and an IANA time zone.",
  parameters: Schema.Struct({
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
    schedule: FriendlyRoutineSchedule,
    enabled: Schema.optionalKey(Schema.Boolean),
  }),
  success: AgentRoutine,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Create agent routine")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const RoutineUpdateTool = Tool.make("routine_update", {
  description:
    "Update the name, prompt, or schedule of one routine owned by this Agent Chat. Omitted fields remain unchanged.",
  parameters: Schema.Struct({
    routineId: AgentRoutineId,
    name: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))),
    prompt: Schema.optionalKey(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
    ),
    schedule: Schema.optionalKey(FriendlyRoutineSchedule),
  }),
  success: AgentRoutine,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Update agent routine")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const RoutineSetEnabledTool = Tool.make("routine_set_enabled", {
  description: "Pause or resume one routine owned by this Agent Chat.",
  parameters: Schema.Struct({ routineId: AgentRoutineId, enabled: Schema.Boolean }),
  success: AgentRoutine,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Pause or resume agent routine")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const RoutineDeleteTool = Tool.make("routine_delete", {
  description: "Permanently delete one routine owned by this Agent Chat.",
  parameters: Schema.Struct({ routineId: AgentRoutineId }),
  success: RoutineDeleteResult,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Delete agent routine")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false);

export const RoutineRunNowTool = Tool.make("routine_run_now", {
  description:
    "Run one routine immediately in this same Agent Chat using its current model and access settings.",
  parameters: Schema.Struct({ routineId: AgentRoutineId }),
  success: RoutineRunResult,
  failure: RoutineToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Run agent routine now")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const AgentRoutineToolkit = Toolkit.make(
  RoutineListTool,
  RoutineCreateTool,
  RoutineUpdateTool,
  RoutineSetEnabledTool,
  RoutineDeleteTool,
  RoutineRunNowTool,
);
