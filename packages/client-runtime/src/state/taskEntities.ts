import type {
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationTask,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentCatalogState } from "./connections.ts";
import type { EnvironmentTask } from "./models.ts";
import { scopeTask } from "./models.ts";

const EMPTY_TASKS: ReadonlyArray<OrchestrationTask> = Object.freeze([]);

export function createEnvironmentTaskAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentTasksAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<OrchestrationTask> =>
        get(input.snapshotAtom(environmentId))?.tasks ?? EMPTY_TASKS,
    ).pipe(Atom.withLabel(`environment-tasks:${environmentId}`)),
  );

  const tasksAtom = Atom.make((get): ReadonlyArray<EnvironmentTask> => {
    const tasks: EnvironmentTask[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      for (const task of get(environmentTasksAtom(environmentId))) {
        tasks.push(scopeTask(environmentId, task));
      }
    }
    return tasks;
  }).pipe(Atom.withLabel("environment-task-list"));

  return { environmentTasksAtom, tasksAtom };
}
