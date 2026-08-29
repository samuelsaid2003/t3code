import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface AgentRoutineReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class AgentRoutineReactor extends Context.Service<
  AgentRoutineReactor,
  AgentRoutineReactorShape
>()("t3/orchestration/Services/AgentRoutineReactor") {}
