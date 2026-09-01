import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("048_Tasks", (it) => {
  it.effect("creates the durable task projection and its ordering indexes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 47 });
      yield* runMigrations({ toMigrationInclusive: 48 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_tasks)
      `;
      assert.deepEqual(
        columns.map((column) => column.name),
        [
          "task_id",
          "title",
          "notes",
          "status",
          "due_at",
          "project_id",
          "thread_id",
          "position",
          "created_at",
          "updated_at",
          "completed_at",
        ],
      );

      const indexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_tasks)
      `;
      assert.ok(indexes.some((index) => index.name === "idx_projection_tasks_status_position"));
      assert.ok(indexes.some((index) => index.name === "idx_projection_tasks_due"));
    }),
  );
});
