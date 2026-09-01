import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createTask,
  deleteTask,
  moveTask,
  reorderTask,
  updateTask,
  type CreateTaskInput,
  type DeleteTaskInput,
  type MoveTaskInput,
  type ReorderTaskInput,
  type UpdateTaskInput,
} from "../operations/commands.ts";
import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";

export type {
  CreateTaskInput,
  DeleteTaskInput,
  MoveTaskInput,
  ReorderTaskInput,
  UpdateTaskInput,
} from "../operations/commands.ts";

export function createTaskEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { taskId: string } }) =>
      JSON.stringify([environmentId, input.taskId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:create",
      execute: (input: CreateTaskInput) => createTask(input),
      scheduler,
      concurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:update",
      execute: (input: UpdateTaskInput) => updateTask(input),
      scheduler,
      concurrency,
    }),
    move: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:move",
      execute: (input: MoveTaskInput) => moveTask(input),
      scheduler,
      concurrency,
    }),
    reorder: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:reorder",
      execute: (input: ReorderTaskInput) => reorderTask(input),
      scheduler,
      concurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:delete",
      execute: (input: DeleteTaskInput) => deleteTask(input),
      scheduler,
      concurrency,
    }),
  };
}
