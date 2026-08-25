---
name: test-t3-desktop
description: Launch, retain, inspect, and drive the isolated T3 Code Samuel development desktop app after frontend or Electron changes, or while reproducing a desktop bug. Use for real Electron window behavior, menus, multi-window flows, split views, updater UI, desktop logs, or CPU and memory verification. Do not use the installed Samuel or Alpha production state as a development backend.
---

# Test T3 Desktop

Run one focused integrated verification pass in **T3 Code (Dev)** while keeping every installed T3 environment and active provider session isolated.

Use [`test-t3-app`](../test-t3-app/SKILL.md) instead for browser-only testing. Read its SQLite fixture reference only when this desktop test genuinely needs seeded database state. Use [`test-t3-mobile`](../test-t3-mobile/SKILL.md) for simulators and emulators.

## Protect live T3 state

- Run from the current checkout and use its ignored `<repo>/.t3` base directory.
- Never launch development against `~/.t3`, `~/.t3/userdata`, `~/.t3-samuel`, or `~/.t3-samuel/userdata`.
- Do not point a second process at any live T3 database. If realistic data is required, make the documented one-way SQLite snapshot into isolated state.
- The development app is **T3 Code (Dev)** with bundle identifier `com.t3tools.t3code.dev.t3code`. Do not operate **T3 Code (Alpha)** or **T3 Code (Samuel)** during a Dev verification unless the user explicitly asks for a comparison.

## Reuse or launch the environment

1. Inspect the current thread terminal and tracked sessions before launching anything. Reuse a healthy Dev desktop process owned by this task when it already contains the relevant code and state.
2. Otherwise start from the repository root with:

   ```bash
   npm run dev:desktop -- --home-dir <absolute-repo-root>/.t3
   ```

3. Retain the terminal session and the exact process identifier returned at spawn. Confirm the `[dev-runner]` line resolves `baseDir` to the checkout's `.t3`, then wait for `app ready`, backend readiness, and `main window created`.
4. Treat early authentication or HTTP errors before backend readiness as startup evidence first. Inspect the terminal and desktop trace before changing code or state.
5. When Electron main-process code changed, use a fresh Dev app process for the final pass so hot reload cannot leave old main-process behavior in memory.

Never kill by name, path match, `pkill`, or `pgrep | kill`. Stop only the retained terminal session or a PID captured when this skill launched it.

## Verify the requested behavior

Before UI testing, run the smallest relevant unit tests, typecheck, lint, and formatting checks for the files changed. Do not run the repository-wide suite unless the user requests it.

When the affected outcome requires desktop UI operation:

1. Ask for Computer Use permission, then load and follow the `computer-use` skill.
2. Target `com.t3tools.t3code.dev.t3code` and fetch fresh accessibility state after navigation or window changes.
3. Reproduce the user's exact sequence, including the reverse state or second attempt that previously failed. Use native menus and accessibility elements for Electron window commands rather than assuming a shortcut was delivered.
4. Verify the visible result and the corresponding terminal or `<repo>/.t3/userdata/logs/desktop.trace.ndjson` evidence. A rendered screen without the expected successful operation is not sufficient.

For multi-window regressions, explicitly count entries in the native **Window** menu, close the created window, create another, and confirm the second creation succeeds. For cross-window state, verify both the original and newly created window rather than checking only the focused one.

## Check performance proportionally

- Sample the exact Dev process tree with read-only process inspection after startup and after the tested action.
- Attribute the Electron main process, backend, GPU/network helpers, resource monitor, and renderer processes separately. Opening another window should add a renderer; closing it should remove that renderer.
- Look for sustained CPU, continually growing renderer count or RSS, repeated navigation, repeated worker creation, or a high-frequency error loop. A brief build or first-render spike is not a regression by itself.
- Inspect fresh logs for the current run ID and distinguish pre-existing warnings from errors caused by the test.

## Retain or stop deliberately

Keep the Dev environment running while the user may test or request follow-up changes. Report that it remains open and identify its isolated base directory. Stop it only when the user asks, the iteration is genuinely finished, or a clean restart is required for the next proof.

At handoff, state:

- the exact workflow tested and whether it passed;
- the targeted checks that passed;
- any current-run warnings or unverified behavior;
- whether the Dev app/server remains running;
- confirmation that live Samuel and Alpha state were not used.
