import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "parent_thread_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN parent_thread_id TEXT
    `;
  }

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_threads_open_side_parent
    ON projection_threads(parent_thread_id)
    WHERE thread_kind = 'side' AND deleted_at IS NULL
  `;
});
