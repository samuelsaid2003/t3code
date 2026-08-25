#!/usr/bin/env node

/**
 * Clone the installed Alpha environment into Samuel's independently packaged
 * fork without ever opening Alpha state read-write.
 *
 * The database is captured with SQLite VACUUM INTO, migrated and sanitized in
 * a sibling staging directory, then installed with a same-filesystem rename.
 * Server identity, auth sessions, cloud credentials, live process state, and
 * logs intentionally do not cross the boundary. Durable provider resume
 * cursors do cross so imported threads can reopen their native transcripts.
 */

// @effect-diagnostics nodeBuiltinImport:off - node:os resolves the two desktop distribution homes.
import * as NodeOS from "node:os";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DESKTOP_DISTRIBUTION_IDENTITY } from "@t3tools/shared/desktopDistributionIdentity";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Command, Flag } from "effect/unstable/cli";

import { migrationManifest, runMigrations } from "../src/persistence/Migrations.ts";
import * as NodeSqliteClient from "../src/persistence/NodeSqliteClient.ts";

export const ALPHA_IMPORT_FILES = [
  "client-settings.json",
  "connection-catalog.json",
  "keybindings.json",
  "saved-environments.json",
  "settings.json",
] as const;

export const ALPHA_IMPORT_DIRECTORIES = ["attachments"] as const;

export class ImportAlphaSourceMissingError extends Schema.TaggedErrorClass<ImportAlphaSourceMissingError>()(
  "ImportAlphaSourceMissingError",
  { databasePath: Schema.String },
) {
  override get message(): string {
    return `Alpha database does not exist at '${this.databasePath}'.`;
  }
}

export class ImportAlphaInvalidDestinationError extends Schema.TaggedErrorClass<ImportAlphaInvalidDestinationError>()(
  "ImportAlphaInvalidDestinationError",
  {
    destinationBaseDir: Schema.String,
    expectedDirectoryName: Schema.String,
  },
) {
  override get message(): string {
    return `Refusing destination '${this.destinationBaseDir}'. The import destination directory must be named '${this.expectedDirectoryName}'.`;
  }
}

export class ImportAlphaSourceIsDestinationError extends Schema.TaggedErrorClass<ImportAlphaSourceIsDestinationError>()(
  "ImportAlphaSourceIsDestinationError",
  { sourceBaseDir: Schema.String },
) {
  override get message(): string {
    return `Refusing to import over the Alpha source at '${this.sourceBaseDir}'.`;
  }
}

export class ImportAlphaDestinationExistsError extends Schema.TaggedErrorClass<ImportAlphaDestinationExistsError>()(
  "ImportAlphaDestinationExistsError",
  { destinationBaseDir: Schema.String },
) {
  override get message(): string {
    return `Fork state already exists at '${this.destinationBaseDir}'. Re-run with --replace to retain it as a timestamped backup before importing.`;
  }
}

export class ImportAlphaDestinationRunningError extends Schema.TaggedErrorClass<ImportAlphaDestinationRunningError>()(
  "ImportAlphaDestinationRunningError",
  {
    destinationBaseDir: Schema.String,
    pid: Schema.Number,
  },
) {
  override get message(): string {
    return `Fork state at '${this.destinationBaseDir}' belongs to a running server (pid ${this.pid}). Stop the fork before importing; Alpha may remain open.`;
  }
}

export class ImportAlphaMigrationSlotCollisionError extends Schema.TaggedErrorClass<ImportAlphaMigrationSlotCollisionError>()(
  "ImportAlphaMigrationSlotCollisionError",
  {
    slot: Schema.Number,
    codeName: Schema.String,
    appliedName: Schema.String,
  },
) {
  override get message(): string {
    return `Migration slot collision at ${this.slot}: this checkout registers '${this.codeName}' but Alpha applied '${this.appliedName}'.`;
  }
}

export class ImportAlphaIntegrityError extends Schema.TaggedErrorClass<ImportAlphaIntegrityError>()(
  "ImportAlphaIntegrityError",
  {
    databasePath: Schema.String,
    result: Schema.String,
  },
) {
  override get message(): string {
    return `Imported database integrity check failed at '${this.databasePath}': ${this.result}`;
  }
}

export const ImportAlphaPhase = Schema.Literals([
  "snapshot",
  "migrate",
  "sanitize",
  "copy-files",
  "compact",
  "verify",
  "install",
]);
export type ImportAlphaPhase = typeof ImportAlphaPhase.Type;

export class ImportAlphaPhaseError extends Schema.TaggedErrorClass<ImportAlphaPhaseError>()(
  "ImportAlphaPhaseError",
  {
    phase: ImportAlphaPhase,
    resource: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Alpha import failed during ${this.phase} at '${this.resource}'.`;
  }
}

const isImportAlphaMigrationSlotCollisionError = Schema.is(ImportAlphaMigrationSlotCollisionError);
const isImportAlphaIntegrityError = Schema.is(ImportAlphaIntegrityError);

export interface RunImportAlphaStateInput {
  readonly sourceBaseDir?: string | undefined;
  readonly destinationBaseDir?: string | undefined;
  readonly replaceExisting: boolean;
  readonly validateOnly: boolean;
}

export interface RunImportAlphaStateOptions {
  readonly expectedDestinationDirName?: string | undefined;
  readonly operationId?: string | undefined;
}

interface ImportedCounts {
  readonly projects: number;
  readonly threads: number;
  readonly messages: number;
  readonly events: number;
}

export interface ImportAlphaStateResult {
  readonly sourceDatabasePath: string;
  readonly destinationBaseDir: string;
  readonly backupBaseDir: Option.Option<string>;
  readonly validateOnly: boolean;
  readonly copiedFiles: ReadonlyArray<string>;
  readonly copiedDirectories: ReadonlyArray<string>;
  readonly copiedProviderSecrets: number;
  readonly counts: ImportedCounts;
  readonly executedMigrations: ReadonlyArray<string>;
}

const ServerRuntimeState = Schema.fromJsonString(Schema.Struct({ pid: Schema.Number }));
const decodeServerRuntimeState = Schema.decodeEffect(ServerRuntimeState);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const ensureForkStopped = Effect.fn("importAlphaState.ensureForkStopped")(function* (
  destinationBaseDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runtimePath = path.join(destinationBaseDir, "userdata", "server-runtime.json");
  const runtime = yield* fs
    .readFileString(runtimePath)
    .pipe(Effect.flatMap(decodeServerRuntimeState), Effect.option);
  if (Option.isSome(runtime) && isProcessAlive(runtime.value.pid)) {
    return yield* new ImportAlphaDestinationRunningError({
      destinationBaseDir,
      pid: runtime.value.pid,
    });
  }
});

const verifyMigrationSlots = Effect.fn("importAlphaState.verifyMigrationSlots")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const applied = yield* sql<{ migration_id: number; name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations`;
  const appliedById = new Map(applied.map((row) => [Number(row.migration_id), row.name]));
  for (const [slot, codeName] of migrationManifest) {
    const appliedName = appliedById.get(slot);
    if (appliedName !== undefined && appliedName !== codeName) {
      return yield* new ImportAlphaMigrationSlotCollisionError({
        slot,
        codeName,
        appliedName,
      });
    }
  }
});

const sanitizeImportedDatabase = Effect.fn("importAlphaState.sanitizeDatabase")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`
        UPDATE provider_session_runtime
        SET
          status = 'stopped',
          runtime_payload_json = json_set(
            CASE
              WHEN runtime_payload_json IS NULL OR json_valid(runtime_payload_json) = 0 THEN '{}'
              WHEN json_type(runtime_payload_json) <> 'object' THEN '{}'
              ELSE runtime_payload_json
            END,
            '$.activeTurnId', NULL,
            '$.lastError', NULL
          )
      `;
      yield* sql`DELETE FROM orchestration_command_receipts`;
      yield* sql`DELETE FROM auth_sessions`;
      yield* sql`DELETE FROM auth_pairing_links`;
    }),
  );
});

const readImportedCounts = Effect.fn("importAlphaState.readCounts")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [counts] = yield* sql<{
    projects: number;
    threads: number;
    messages: number;
    events: number;
  }>`SELECT
    (SELECT COUNT(*) FROM projection_projects WHERE deleted_at IS NULL) AS projects,
    (SELECT COUNT(*) FROM projection_threads WHERE deleted_at IS NULL) AS threads,
    (SELECT COUNT(*) FROM projection_thread_messages) AS messages,
    (SELECT COUNT(*) FROM orchestration_events) AS events`;
  return {
    projects: Number(counts?.projects ?? 0),
    threads: Number(counts?.threads ?? 0),
    messages: Number(counts?.messages ?? 0),
    events: Number(counts?.events ?? 0),
  } satisfies ImportedCounts;
});

const copyIfPresent = Effect.fn("importAlphaState.copyIfPresent")(function* (
  source: string,
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(source))) return false;
  yield* fs.copy(source, destination);
  return true;
});

const copyProviderEnvironmentSecrets = Effect.fn("importAlphaState.copyProviderEnvironmentSecrets")(
  function* (sourceStateDir: string, destinationStateDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceSecretsDir = path.join(sourceStateDir, "secrets");
    if (!(yield* fs.exists(sourceSecretsDir))) return 0;

    const secretNames = (yield* fs.readDirectory(sourceSecretsDir)).filter(
      (name) => name.startsWith("provider-env-") && name.endsWith(".bin"),
    );
    if (secretNames.length === 0) return 0;

    const destinationSecretsDir = path.join(destinationStateDir, "secrets");
    yield* fs.makeDirectory(destinationSecretsDir, { recursive: true });
    yield* fs.chmod(destinationSecretsDir, 0o700);
    for (const name of secretNames) {
      const destination = path.join(destinationSecretsDir, name);
      yield* fs.copyFile(path.join(sourceSecretsDir, name), destination);
      yield* fs.chmod(destination, 0o600);
    }
    return secretNames.length;
  },
);

const wrapPhase =
  (phase: ImportAlphaPhase, resource: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        isImportAlphaMigrationSlotCollisionError(cause) || isImportAlphaIntegrityError(cause)
          ? cause
          : new ImportAlphaPhaseError({ phase, resource, cause }),
      ),
    );

export const runImportAlphaState = Effect.fn("runImportAlphaState")(function* (
  input: RunImportAlphaStateInput,
  options: RunImportAlphaStateOptions = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const homeDirectory = NodeOS.homedir();
  const sourceBaseDir = path.resolve(input.sourceBaseDir ?? path.join(homeDirectory, ".t3"));
  const destinationBaseDir = path.resolve(
    input.destinationBaseDir ??
      path.join(homeDirectory, DESKTOP_DISTRIBUTION_IDENTITY.desktopHomeDirName),
  );
  const expectedDestinationDirName =
    options.expectedDestinationDirName ?? DESKTOP_DISTRIBUTION_IDENTITY.desktopHomeDirName;
  const sourceStateDir = path.join(sourceBaseDir, "userdata");
  const sourceDatabasePath = path.join(sourceStateDir, "state.sqlite");

  if (path.basename(destinationBaseDir) !== expectedDestinationDirName) {
    return yield* new ImportAlphaInvalidDestinationError({
      destinationBaseDir,
      expectedDirectoryName: expectedDestinationDirName,
    });
  }
  if (!(yield* fs.exists(sourceDatabasePath))) {
    return yield* new ImportAlphaSourceMissingError({ databasePath: sourceDatabasePath });
  }

  const [canonicalSource, canonicalDestination] = yield* Effect.all([
    fs.realPath(sourceBaseDir).pipe(Effect.orElseSucceed(() => sourceBaseDir)),
    fs.realPath(destinationBaseDir).pipe(Effect.orElseSucceed(() => destinationBaseDir)),
  ]);
  if (canonicalSource === canonicalDestination) {
    return yield* new ImportAlphaSourceIsDestinationError({ sourceBaseDir });
  }

  const destinationExists = yield* fs.exists(destinationBaseDir);
  if (destinationExists) {
    yield* ensureForkStopped(destinationBaseDir);
    if (!input.replaceExisting && !input.validateOnly) {
      return yield* new ImportAlphaDestinationExistsError({ destinationBaseDir });
    }
  }

  const operationId =
    options.operationId ??
    `${DateTime.formatIso(yield* DateTime.now).replaceAll(":", "-")}-${process.pid}`;
  const stageBaseDir = path.join(
    path.dirname(destinationBaseDir),
    `${path.basename(destinationBaseDir)}.importing-${operationId}`,
  );
  const backupBaseDir = path.join(
    path.dirname(destinationBaseDir),
    `${path.basename(destinationBaseDir)}.backup-${operationId}`,
  );
  const stageStateDir = path.join(stageBaseDir, "userdata");
  const workingDatabasePath = path.join(stageStateDir, "state.sqlite.importing");
  const stageDatabasePath = path.join(stageStateDir, "state.sqlite");

  if ((yield* fs.exists(stageBaseDir)) || (yield* fs.exists(backupBaseDir))) {
    return yield* new ImportAlphaPhaseError({
      phase: "install",
      resource: stageBaseDir,
      cause: new Error("Import staging or backup path already exists."),
    });
  }

  yield* fs.makeDirectory(stageStateDir, { recursive: true });
  yield* fs.chmod(stageBaseDir, 0o700);
  yield* fs.chmod(stageStateDir, 0o700);

  const prepared = yield* Effect.gen(function* () {
    yield* Console.log(`Snapshotting Alpha read-only from ${sourceDatabasePath}...`);
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`VACUUM INTO ${workingDatabasePath}`;
    }).pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: sourceDatabasePath, readonly: true })),
      wrapPhase("snapshot", sourceDatabasePath),
    );

    yield* Console.log("Running fork migrations on the snapshot...");
    const executedMigrations = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.unsafe("PRAGMA foreign_keys = ON").unprepared;
      const executed = yield* runMigrations();
      yield* verifyMigrationSlots();
      return executed;
    }).pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: workingDatabasePath })),
      wrapPhase("migrate", workingDatabasePath),
    );

    yield* sanitizeImportedDatabase().pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: workingDatabasePath })),
      wrapPhase("sanitize", workingDatabasePath),
    );

    const copiedFiles: string[] = [];
    const copiedDirectories: string[] = [];
    yield* Effect.gen(function* () {
      for (const name of ALPHA_IMPORT_FILES) {
        if (yield* copyIfPresent(path.join(sourceStateDir, name), path.join(stageStateDir, name))) {
          copiedFiles.push(name);
        }
      }
      for (const name of ALPHA_IMPORT_DIRECTORIES) {
        if (yield* copyIfPresent(path.join(sourceStateDir, name), path.join(stageStateDir, name))) {
          copiedDirectories.push(name);
        }
      }
    }).pipe(wrapPhase("copy-files", sourceStateDir));

    const copiedProviderSecrets = yield* copyProviderEnvironmentSecrets(
      sourceStateDir,
      stageStateDir,
    ).pipe(wrapPhase("copy-files", path.join(sourceStateDir, "secrets")));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`VACUUM INTO ${stageDatabasePath}`;
    }).pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: workingDatabasePath })),
      wrapPhase("compact", stageDatabasePath),
    );
    yield* fs.remove(workingDatabasePath, { force: true });
    yield* fs.remove(`${workingDatabasePath}-wal`, { force: true });
    yield* fs.remove(`${workingDatabasePath}-shm`, { force: true });
    yield* fs.chmod(stageDatabasePath, 0o600);

    const counts = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const [integrity] = yield* sql<{ integrity_check: string }>`PRAGMA integrity_check`;
      const result = integrity?.integrity_check ?? "missing result";
      if (result !== "ok") {
        return yield* new ImportAlphaIntegrityError({ databasePath: stageDatabasePath, result });
      }
      return yield* readImportedCounts();
    }).pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: stageDatabasePath, readonly: true })),
      wrapPhase("verify", stageDatabasePath),
    );

    return {
      copiedFiles,
      copiedDirectories,
      copiedProviderSecrets,
      counts,
      executedMigrations: executedMigrations.map(([id, name]) => `${id}_${name}`),
    };
  }).pipe(
    Effect.ensuring(
      fs.remove(workingDatabasePath, { force: true }).pipe(Effect.orElseSucceed(() => undefined)),
    ),
    Effect.onError(() =>
      fs.remove(stageBaseDir, { recursive: true, force: true }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not remove failed Alpha import staging directory.", {
            stageBaseDir,
            error,
          }),
        ),
      ),
    ),
  );

  let installedBackup = Option.none<string>();
  if (input.validateOnly) {
    yield* fs.remove(stageBaseDir, { recursive: true, force: true });
  } else {
    yield* Effect.gen(function* () {
      if (destinationExists) {
        yield* fs.rename(destinationBaseDir, backupBaseDir);
        installedBackup = Option.some(backupBaseDir);
      }
      yield* fs.rename(stageBaseDir, destinationBaseDir).pipe(
        Effect.tapError(() =>
          Option.match(installedBackup, {
            onNone: () => Effect.void,
            onSome: (backup) => fs.rename(backup, destinationBaseDir).pipe(Effect.ignore),
          }),
        ),
      );
    }).pipe(wrapPhase("install", destinationBaseDir));
  }

  return {
    sourceDatabasePath,
    destinationBaseDir,
    backupBaseDir: installedBackup,
    validateOnly: input.validateOnly,
    ...prepared,
  } satisfies ImportAlphaStateResult;
});

function formatResult(result: ImportAlphaStateResult): ReadonlyArray<string> {
  const mode = result.validateOnly ? "validated" : "installed";
  const lines = [
    `Fork state ${mode}: ${result.destinationBaseDir}`,
    `  Projects: ${result.counts.projects}`,
    `  Threads: ${result.counts.threads}`,
    `  Messages: ${result.counts.messages}`,
    `  Events: ${result.counts.events}`,
    `  Files copied: ${result.copiedFiles.join(", ") || "none"}`,
    `  Directories copied: ${result.copiedDirectories.join(", ") || "none"}`,
    `  Provider environment secrets copied: ${result.copiedProviderSecrets}`,
    result.executedMigrations.length === 0
      ? "  Migrations: already current"
      : `  Migrations applied: ${result.executedMigrations.join(", ")}`,
  ];
  if (Option.isSome(result.backupBaseDir)) {
    lines.push(`  Previous fork backup: ${result.backupBaseDir.value}`);
  }
  return lines;
}

export const importAlphaStateCommand = Command.make(
  "import-alpha-state",
  {
    sourceHome: Flag.string("source-home").pipe(
      Flag.optional,
      Flag.withDescription("Alpha T3 home. Defaults to ~/.t3."),
    ),
    destinationHome: Flag.string("destination-home").pipe(
      Flag.optional,
      Flag.withDescription(
        `Fork T3 home. Defaults to ~/${DESKTOP_DISTRIBUTION_IDENTITY.desktopHomeDirName}.`,
      ),
    ),
    replace: Flag.boolean("replace").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Back up and replace existing fork state."),
    ),
    validateOnly: Flag.boolean("validate-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Build and verify a temporary import without installing it."),
    ),
  },
  ({ sourceHome, destinationHome, replace, validateOnly }) =>
    Effect.gen(function* () {
      const result = yield* runImportAlphaState({
        sourceBaseDir: Option.getOrUndefined(sourceHome),
        destinationBaseDir: Option.getOrUndefined(destinationHome),
        replaceExisting: replace,
        validateOnly,
      });
      for (const line of formatResult(result)) {
        yield* Console.log(line);
      }
      if (!validateOnly) {
        yield* Console.log(
          "Alpha was read-only. The fork has a new server identity and requires fresh client pairing.",
        );
      }
    }),
).pipe(
  Command.withDescription(
    "Safely clone installed Alpha history and preferences into the independently packaged fork.",
  ),
);

if (import.meta.main) {
  Command.run(importAlphaStateCommand, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
