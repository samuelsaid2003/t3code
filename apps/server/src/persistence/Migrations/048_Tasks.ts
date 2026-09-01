import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      due_at TEXT,
      project_id TEXT,
      thread_id TEXT,
      position REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tasks_status_position
    ON projection_tasks(status, position, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tasks_due
    ON projection_tasks(completed_at, due_at, created_at)
  `;
});
