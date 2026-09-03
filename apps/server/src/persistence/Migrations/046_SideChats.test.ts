import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("046_SideChats", (it) => {
  it.effect("adds the side-chat parent relation and uniqueness index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 45 });
      yield* runMigrations({ toMigrationInclusive: 46 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      assert.ok(columns.some((column) => column.name === "parent_thread_id"));

      const indexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_threads)
      `;
      assert.ok(indexes.some((index) => index.name === "idx_projection_threads_open_side_parent"));
    }),
  );
});
