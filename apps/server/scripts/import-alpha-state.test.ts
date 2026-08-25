import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../src/persistence/Migrations.ts";
import * as NodeSqliteClient from "../src/persistence/NodeSqliteClient.ts";
import {
  ImportAlphaDestinationRunningError,
  ImportAlphaInvalidDestinationError,
  ImportAlphaMigrationSlotCollisionError,
  runImportAlphaState,
} from "./import-alpha-state.ts";

const withDatabase = <A, E>(
  databasePath: string,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provide(NodeSqliteClient.layer({ filename: databasePath })));

const createAlphaFixture = Effect.fn("createAlphaImportFixture")(function* (sourceBaseDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDir = path.join(sourceBaseDir, "userdata");
  const databasePath = path.join(stateDir, "state.sqlite");
  yield* fs.makeDirectory(path.join(stateDir, "attachments"), { recursive: true });
  yield* fs.makeDirectory(path.join(stateDir, "secrets"), { recursive: true });

  yield* withDatabase(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* sql`INSERT INTO projection_projects
        (project_id, title, workspace_root, scripts_json, created_at, updated_at, deleted_at)
        VALUES ('project-1', 'Imported Project', '/tmp/imported', '[]', '2026-08-01', '2026-08-01', NULL)`;
      yield* sql`INSERT INTO projection_threads
        (thread_id, project_id, title, created_at, updated_at)
        VALUES ('thread-1', 'project-1', 'Imported Thread', '2026-08-01', '2026-08-01')`;
      yield* sql`INSERT INTO projection_thread_messages
        (message_id, thread_id, role, text, is_streaming, created_at, updated_at)
        VALUES ('message-1', 'thread-1', 'user', 'preserved', 0, '2026-08-01', '2026-08-01')`;
      yield* sql`INSERT INTO orchestration_events
        (event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at, actor_kind, payload_json, metadata_json)
        VALUES ('event-1', 'thread', 'thread-1', 0, 'thread.created', '2026-08-01', 'user', '{}', '{}')`;
      yield* sql`INSERT INTO auth_sessions
        (session_id, subject, scopes, method, issued_at, expires_at)
        VALUES ('alpha-session', 'user', '[]', 'pairing', '2026-08-01', '2027-08-01')`;
    }),
  );

  yield* fs.writeFileString(path.join(stateDir, "client-settings.json"), '{"fontSize":14}');
  yield* fs.writeFileString(path.join(stateDir, "settings.json"), "{}");
  yield* fs.writeFileString(path.join(stateDir, "connection-catalog.json"), "encrypted");
  yield* fs.writeFileString(path.join(stateDir, "desktop-settings.json"), "do-not-copy");
  yield* fs.writeFileString(path.join(stateDir, "clerk-tokens.json"), "do-not-copy");
  yield* fs.writeFileString(path.join(stateDir, "environment-id"), "alpha-environment");
  yield* fs.writeFileString(path.join(stateDir, "server-runtime.json"), '{"pid":999999}');
  yield* fs.writeFileString(path.join(stateDir, "attachments", "image.txt"), "attachment");
  yield* fs.writeFileString(
    path.join(stateDir, "secrets", "provider-env-a-b.bin"),
    "provider-secret",
  );
  yield* fs.writeFileString(
    path.join(stateDir, "secrets", "cloud-relay-environment-credential.bin"),
    "do-not-copy",
  );
  yield* fs.writeFileString(
    path.join(stateDir, "secrets", "server-signing-key.bin"),
    "do-not-copy",
  );

  return databasePath;
});

it.layer(NodeServices.layer)("import-alpha-state", (it) => {
  it.effect("installs complete durable history while isolating runtime identity", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceBaseDir = yield* fs.makeTempDirectoryScoped({ prefix: "alpha-import-src-" });
        const destinationParent = yield* fs.makeTempDirectoryScoped({
          prefix: "alpha-import-dest-",
        });
        const destinationBaseDir = path.join(destinationParent, ".t3-samuel");
        const sourceDatabasePath = yield* createAlphaFixture(sourceBaseDir);

        const result = yield* runImportAlphaState(
          {
            sourceBaseDir,
            destinationBaseDir,
            replaceExisting: false,
            validateOnly: false,
          },
          { operationId: "first" },
        );

        assert.deepStrictEqual(result.counts, {
          projects: 1,
          threads: 1,
          messages: 1,
          events: 1,
        });
        assert.isTrue(Option.isNone(result.backupBaseDir));
        const destinationStateDir = path.join(destinationBaseDir, "userdata");
        const importedDatabasePath = path.join(destinationStateDir, "state.sqlite");
        const imported = yield* withDatabase(
          importedDatabasePath,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const [message] = yield* sql<{ text: string }>`
              SELECT text FROM projection_thread_messages WHERE message_id = 'message-1'`;
            const [auth] = yield* sql<{
              count: number;
            }>`SELECT COUNT(*) AS count FROM auth_sessions`;
            return { text: message?.text, authCount: Number(auth?.count ?? 0) };
          }),
        );
        assert.deepStrictEqual(imported, { text: "preserved", authCount: 0 });

        const [sourceAuth] = yield* withDatabase(
          sourceDatabasePath,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            return yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM auth_sessions`;
          }),
        );
        assert.equal(Number(sourceAuth?.count ?? 0), 1);

        assert.equal(
          yield* fs.readFileString(path.join(destinationStateDir, "attachments", "image.txt")),
          "attachment",
        );
        assert.equal(
          yield* fs.readFileString(
            path.join(destinationStateDir, "secrets", "provider-env-a-b.bin"),
          ),
          "provider-secret",
        );
        for (const forbidden of [
          "desktop-settings.json",
          "clerk-tokens.json",
          "environment-id",
          "server-runtime.json",
          path.join("secrets", "cloud-relay-environment-credential.bin"),
          path.join("secrets", "server-signing-key.bin"),
        ]) {
          assert.isFalse(yield* fs.exists(path.join(destinationStateDir, forbidden)));
        }
      }),
    ),
  );

  it.effect("validates against disposable staging without installing a destination", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceBaseDir = yield* fs.makeTempDirectoryScoped({ prefix: "alpha-validate-src-" });
        const destinationParent = yield* fs.makeTempDirectoryScoped({
          prefix: "alpha-validate-dest-",
        });
        const destinationBaseDir = path.join(destinationParent, ".t3-samuel");
        yield* createAlphaFixture(sourceBaseDir);

        const result = yield* runImportAlphaState(
          {
            sourceBaseDir,
            destinationBaseDir,
            replaceExisting: false,
            validateOnly: true,
          },
          { operationId: "validate" },
        );

        assert.isTrue(result.validateOnly);
        assert.isFalse(yield* fs.exists(destinationBaseDir));
        assert.isFalse(
          yield* fs.exists(path.join(destinationParent, ".t3-samuel.importing-validate")),
        );
      }),
    ),
  );

  it.effect("backs up existing fork state and refuses replacement while it is running", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceBaseDir = yield* fs.makeTempDirectoryScoped({ prefix: "alpha-replace-src-" });
        const destinationParent = yield* fs.makeTempDirectoryScoped({
          prefix: "alpha-replace-dest-",
        });
        const destinationBaseDir = path.join(destinationParent, ".t3-samuel");
        const destinationStateDir = path.join(destinationBaseDir, "userdata");
        yield* createAlphaFixture(sourceBaseDir);
        yield* fs.makeDirectory(destinationStateDir, { recursive: true });
        yield* fs.writeFileString(path.join(destinationBaseDir, "previous.txt"), "previous");
        yield* fs.writeFileString(
          path.join(destinationStateDir, "server-runtime.json"),
          `{"pid":${process.pid}}`,
        );

        const running = yield* runImportAlphaState(
          {
            sourceBaseDir,
            destinationBaseDir,
            replaceExisting: true,
            validateOnly: false,
          },
          { operationId: "running" },
        ).pipe(Effect.flip);
        assert.instanceOf(running, ImportAlphaDestinationRunningError);

        yield* fs.remove(path.join(destinationStateDir, "server-runtime.json"));
        const replaced = yield* runImportAlphaState(
          {
            sourceBaseDir,
            destinationBaseDir,
            replaceExisting: true,
            validateOnly: false,
          },
          { operationId: "replace" },
        );
        assert.isTrue(Option.isSome(replaced.backupBaseDir));
        if (Option.isSome(replaced.backupBaseDir)) {
          assert.equal(
            yield* fs.readFileString(path.join(replaced.backupBaseDir.value, "previous.txt")),
            "previous",
          );
        }
        assert.isFalse(yield* fs.exists(path.join(destinationBaseDir, "previous.txt")));
      }),
    ),
  );

  it.effect("rejects broad destinations and migration slot collisions before installation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceBaseDir = yield* fs.makeTempDirectoryScoped({ prefix: "alpha-guard-src-" });
        const destinationParent = yield* fs.makeTempDirectoryScoped({
          prefix: "alpha-guard-dest-",
        });
        const sourceDatabasePath = yield* createAlphaFixture(sourceBaseDir);

        const broadDestination = yield* runImportAlphaState({
          sourceBaseDir,
          destinationBaseDir: destinationParent,
          replaceExisting: false,
          validateOnly: false,
        }).pipe(Effect.flip);
        assert.instanceOf(broadDestination, ImportAlphaInvalidDestinationError);

        yield* withDatabase(
          sourceDatabasePath,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            yield* sql`UPDATE effect_sql_migrations
              SET name = 'SomebodyElsesMigration' WHERE migration_id = 1`;
          }),
        );
        const destinationBaseDir = path.join(destinationParent, ".t3-samuel");
        const collision = yield* runImportAlphaState(
          {
            sourceBaseDir,
            destinationBaseDir,
            replaceExisting: false,
            validateOnly: false,
          },
          { operationId: "collision" },
        ).pipe(Effect.flip);
        assert.instanceOf(collision, ImportAlphaMigrationSlotCollisionError);
        assert.isFalse(yield* fs.exists(destinationBaseDir));
        assert.isFalse(
          yield* fs.exists(path.join(destinationParent, ".t3-samuel.importing-collision")),
        );
      }),
    ),
  );
});
