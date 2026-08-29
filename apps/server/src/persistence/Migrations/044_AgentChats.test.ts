import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_AgentChats", (it) => {
  it.effect("adds persistent agent metadata without changing existing thread kinds", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* runMigrations({ toMigrationInclusive: 44 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      for (const name of [
        "thread_kind",
        "agent_profile_json",
        "agent_routines_json",
        "agent_runs_json",
      ]) {
        assert.ok(
          columns.some((column) => column.name === name),
          `missing ${name}`,
        );
      }

      const indexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_threads)
      `;
      assert.ok(indexes.some((index) => index.name === "idx_projection_threads_kind_updated"));
    }),
  );
});
