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

The imported database must pass the fork's migrations against a disposable copy before it is used by
the packaged app. Secrets and settings are copied only when the corresponding connection flow needs
them.

## Updates

Packaged production builds embed the fork's GitHub Releases feed. A stable version tag produces a
DMG, ZIP update payload, update manifest, and blockmap for each supported macOS architecture. The
desktop updater checks the feed but preserves the existing manual download-and-restart interaction.

Release artifacts intended for normal installation must use the permanent bundle ID and a consistent
Developer ID Application certificate, hardened runtime, and Apple notarization. Local unsigned builds
are verification artifacts only.

The upstream release workflow also publishes npm, relay, and hosted-service components. It is not the
fork's distribution mechanism and must remain guarded from running against this repository. Fork
releases use a desktop-only workflow and `samuelsaid2003/t3code` as the update owner.
