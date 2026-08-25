# Samuel fork desktop distribution

> Fork-specific architecture and release invariants for the independently distributed desktop app.

The fork is a separate macOS application, not an in-place replacement for the upstream T3 Code
Alpha app. It must be safe to install and run both applications at the same time.

## Identity and storage boundaries

The canonical values live in
[`desktopDistributionIdentity.ts`](../../packages/shared/src/desktopDistributionIdentity.ts). The
runtime and artifact builder consume the same constants so packaging metadata cannot silently drift
from the application runtime.

| Boundary               | Samuel fork             | Upstream Alpha                           |
| ---------------------- | ----------------------- | ---------------------------------------- |
| Product name           | `T3 Code (Samuel)`      | `T3 Code (Alpha)`                        |
| macOS bundle ID        | `com.samuelsaid.t3code` | `com.t3tools.t3code`                     |
| Production URL scheme  | `t3code-samuel`         | `t3code`                                 |
| Development URL scheme | `t3code-samuel-dev`     | `t3code-dev`                             |
| Default T3 home        | `~/.t3-samuel`          | `~/.t3`                                  |
| Production state       | `~/.t3-samuel/userdata` | `~/.t3/userdata`                         |
| Electron user data     | `t3code-samuel`         | `t3code` or its legacy product directory |
| Updater cache          | `t3code-samuel-updater` | `t3code-updater`                         |
| Update repository      | `samuelsaid2003/t3code` | `pingdotgg/t3code`                       |

These values are persistent identities. Changing the bundle ID or signing certificate breaks
seamless macOS updates. Changing the T3 home makes existing threads, projects, and connections appear
to disappear. Any future rename must therefore include an explicit migration.

## Alpha isolation incident

On 2026-08-25, desktop development was launched with an explicit `--home-dir` pointing at `~/.t3`.
An explicit T3 home is already the base directory, so desktop state is stored in its `userdata`
child. Development therefore opened Alpha's live `~/.t3/userdata/state.sqlite` instead of isolated
development state.

The second server's startup reconciliation had no matching provider processes in its own runtime.
It classified the two persisted active Codex sessions as orphaned and wrote the standard
"Provider session did not survive a server restart" error for both. The two error events landed at
02:14:19Z, immediately after the second backend's migration attempt against the shared database.

The dev runner now refuses a resolved home of `~/.t3`. From this checkout, the safe desktop command
is:

```bash
npm run dev:desktop
```

The checkout's gitignored `.t3` directory is selected automatically. Do not add `--home-dir ~/.t3`.

## Data migration

Installation and updates never copy Alpha data automatically. A parallel fork installation starts
under `~/.t3-samuel/userdata`. Import is an explicit, one-way operation performed while no fork
server is using the destination. The Alpha source remains read-only and is captured with SQLite
`VACUUM INTO` so the snapshot is consistent while Alpha is running.

Validate the complete import against disposable staging without installing it:

```bash
npm run import-alpha-state -- --validate-only
```

Install the snapshot immediately before the first fork launch:

```bash
npm run import-alpha-state
```

If fork state already exists, the command refuses to replace it. An intentional refresh uses
`--replace`; the previous fork home is retained as a timestamped sibling backup and restored if the
new directory cannot be installed.

The imported database must pass this checkout's migrations and SQLite integrity check before the
staged directory can replace anything. The import carries all projects, threads, messages, events,
attachments, client preferences, keybindings, server settings, saved desktop connection metadata,
and provider-instance environment secrets. Provider CLI logins remain available through their
normal user-level configuration on the Mac.

The import deliberately excludes Alpha's environment ID, server signing keys, auth and phone pairing
sessions, Clerk tokens, cloud/T3 Connect credentials, desktop exposure settings, and logs. Those
values identify a running environment rather than durable history. The fork therefore gets a new
server identity and requires fresh client pairing.

Provider processes cannot cross environments, but their durable resume cursors are part of thread
history. The import retains those cursors while forcing every copied provider binding to `stopped`
and clearing active-turn and transient-error state. Launching the fork therefore does not attach to
or interrupt an Alpha provider process; the next message in an imported thread explicitly reopens
its native provider transcript. Do not send new messages to the same thread in both environments at
once. Take the final import as close as possible to cutover, ideally after important Alpha turns
settle. This is a point-in-time clone, not ongoing synchronization.

## Updates

Packaged production builds embed the fork's GitHub Releases feed. A stable version tag produces a
DMG, ZIP update payload, update manifest, and blockmap for each supported macOS architecture. The
desktop updater checks the feed but preserves the existing manual download-and-restart interaction.

Release artifacts intended for normal installation must use the permanent bundle ID and a consistent
Developer ID Application certificate, hardened runtime, and Apple notarization. Local unsigned builds
are verification artifacts only.

The fork release workflow expects the signing certificate and notarization credentials as encrypted
GitHub repository secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and
`APPLE_API_ISSUER`. `APPLE_TEAM_ID` is a repository variable. Never put their values in source,
workflow YAML, issues, logs, or chat.

Native macOS Clerk passkeys are intentionally disabled for the fork because the official T3 Clerk
associated-domain file does not authorize the fork's Apple team and bundle ID. Standard signing,
notarization, provider authentication, and local or remote pairing do not require that entitlement.
If the fork later owns a compatible Clerk domain, opt in by supplying `T3CODE_APPLE_TEAM_ID`,
`T3CODE_MACOS_PROVISIONING_PROFILE`, and either `T3CODE_CLERK_PASSKEY_RP_DOMAINS` or the matching
Clerk publishable key. Partial passkey configuration fails the build rather than silently emitting
incorrect entitlements.

The upstream release workflow also publishes npm, relay, and hosted-service components. It is not the
fork's distribution mechanism and must remain guarded from running against this repository. Fork
releases use a desktop-only workflow and `samuelsaid2003/t3code` as the update owner.
