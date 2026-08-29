import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "thread_kind")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN thread_kind TEXT NOT NULL DEFAULT 'standard'
    `;
  }
  if (!columns.some((column) => column.name === "agent_profile_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN agent_profile_json TEXT
    `;
  }
  if (!columns.some((column) => column.name === "agent_routines_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN agent_routines_json TEXT NOT NULL DEFAULT '[]'
    `;
  }
  if (!columns.some((column) => column.name === "agent_runs_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN agent_runs_json TEXT NOT NULL DEFAULT '[]'
    `;
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_kind_updated
    ON projection_threads(thread_kind, updated_at DESC)
  `;
});
