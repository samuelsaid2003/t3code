---
name: release-t3-samuel
description: Prepare, tag, publish, and verify a signed macOS release of Samuel's T3 Code fork through its dedicated GitHub Actions workflow. Use when the user explicitly asks to release, ship, package, publish, or push a new T3S version. Do not use for upstream T3 Code releases, ordinary commits, local unsigned builds, or requests that only ask whether a change is ready.
---

# Release T3 Samuel

Publish an immutable T3 Code Samuel update from `samuelsaid2003/t3code` without touching upstream distribution or the user's live T3 data.

Before acting, read:

- [`docs/internals/fork-desktop-distribution.md`](../../../docs/internals/fork-desktop-distribution.md) for identity, storage, signing, updater, and migration invariants;
- [`.github/workflows/release-macos-fork.yml`](../../../.github/workflows/release-macos-fork.yml) for the current quality gates, build matrix, secrets, artifacts, and release trigger.

Use the workflow and docs as authority when commands or asset names have changed since this skill was written.

## Respect the release boundary

- `origin` must resolve to Samuel's writable fork, `samuelsaid2003/t3code`. Treat `upstream` (`pingdotgg/t3code`) as read-only and never push a branch or tag to it.
- A direct user instruction to **release**, **publish**, **push the update**, or equivalent authorizes the normal commit, `origin/main` push, version tag, and release-monitoring actions for the in-scope work. A request to prepare, review, test, or estimate does not.
- If the user pauses or cancels a release, stop immediately. Do not restart, retag, rerun, or create a replacement version until asked.
- Never expose signing certificates, passwords, Apple API credentials, or repository secrets. GitHub Actions owns signing and notarization.

## Protect identity and durable state

The production bundle identifier, URL scheme, T3 home, Electron user-data directory, updater cache, signing identity, and update repository are persistent compatibility boundaries. Do not change them as part of a routine release.

An update must continue using `~/.t3-samuel/userdata`; projects, threads, messages, attachments, provider resume cursors, credentials, connections, and settings therefore remain in place. Packaging does not require opening or migrating the live database. If the release contains schema or identity changes, require focused migration and upgrade-path evidence before tagging.

Never run a development or packaging server against `~/.t3-samuel` or `~/.t3` while preparing a release.

## Establish the exact release state

1. Inspect `git status`, the current branch, `origin/main`, remotes, recent commits, existing semantic-version tags, GitHub releases, and recent `release-macos-fork.yml` runs.
2. Confirm every uncommitted change belongs to the requested release. Preserve unrelated user changes; do not bundle them merely to obtain a clean worktree.
3. Resolve the version before mutation. Use the user's version when specified. When they ask for the “next” release and the sequence is unambiguous, use the next patch; otherwise ask.
4. A remote tag or published release is immutable. Never force, move, delete, or recreate it by default. If a tagged build needs another fix, issue a newer patch version. An explicitly cancelled, unpublished tag still requires the user's direction before any rewrite.

## Validate before publishing

- Review the final diff and run `git diff --check`.
- Run the smallest tests, typechecks, lint, formatting, and real Dev desktop verification proportional to the changed code. Use [`test-t3-desktop`](../test-t3-desktop/SKILL.md) for Electron behavior.
- Mirror the current fork workflow's declared quality gates when release infrastructure, packaging, desktop identity, or updater behavior changed.
- Do not substitute an unsigned local DMG for the GitHub workflow's signed and notarized artifacts.
- Confirm the user-visible behavior was tested before tagging. Record any intentionally unverified surface rather than claiming complete coverage.

## Commit, push, and tag

1. Commit only the release's in-scope files on `main` with a concise conventional commit message. Do not create a release branch unless the user asks.
2. Recheck that `HEAD` is the intended commit and that the worktree contains no overlooked release changes.
3. Push `main` to `origin`.
4. Create an annotated `vX.Y.Z` tag at that exact commit and push only that tag to `origin`.
5. Do not manually start the upstream unified release workflow. The fork's tag-triggered **Release macOS fork** workflow is the distribution path; an upstream workflow skipped by its repository guard is expected.

The fork workflow derives the packaged version from the tag and aligns package versions during the build. Do not create unrelated package-version churn unless the current workflow or source explicitly requires it.

## Monitor and verify the published update

1. Find the workflow run associated with the pushed tag and monitor it through completion. Prefer `gh run` status and logs over repeatedly refreshing browser UI.
2. Confirm the quality job, signed/notarized arm64 build, signed/notarized x64 build, manifest merge, and GitHub release job all succeeded.
3. If a job fails, preserve its logs and identify the cause. Do not retry an uncertain publish through another mechanism, and do not move the tag. Fix the cause only within the user's scope, then use a new version unless explicitly directed otherwise.
4. Inspect the GitHub release and confirm it is marked latest and contains the expected DMG, ZIP update payloads, blockmaps, and merged `latest-mac.yml` metadata for both architectures.
5. Inspect the update manifest from a temporary directory and confirm its version and referenced files match the release. Do not install the update or alter the user's running T3S instance unless requested.

At handoff, report the commit, tag, workflow result, release URL, artifact/update-feed verification, and any remaining manual check. State explicitly that the production identity and T3S durable state path were unchanged.
