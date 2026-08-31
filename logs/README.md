# T3 Code work logs

This directory is the chronological maintainer memory for Samuel's T3 Code fork. It records meaningful completed work and operational outcomes without turning agent transcripts or scratch research into repository documentation.

## Layout

Daily entries live at `logs/work-logs/YYYY-MM-DD.md`, using the calendar day in `Australia/Melbourne`.

Create or update the current day's file whenever a top-level session:

- changes code, tests, documentation, packaging, or repository policy;
- commits, tags, publishes, deploys, or performs another hosted action;
- completes an investigation whose conclusion will affect later work;
- encounters a material mistake, recovery, blocker, or deferred risk.

One file may contain several sessions. Append a new timestamped section or extend the relevant milestone without deleting earlier accurate history.

## What to record

Prefer outcomes over process. A useful entry contains the applicable parts of:

- the goal and resulting behavior;
- important implementation or product decisions;
- affected surfaces and providers;
- mistakes, unexpected findings, and how they were recovered;
- focused tests, manual acceptance, release checks, and their outcomes;
- commits, tags, releases, workflow runs, or other hosted actions;
- blockers, known limitations, and the next safe step;
- whether the work remains uncommitted, committed, pushed, or released.

Link to commits, releases, current docs, or issues when those records exist. Keep entries concise and group related commits into a milestone.

## What not to record

Do not include:

- secrets, tokens, credentials, signing material, or pairing URLs;
- private user data or the contents of live databases;
- full chat transcripts, raw command output, or minute-by-minute narration;
- speculative plans, abandoned drafts, or unverified claims;
- large copied diffs that Git already preserves.

Aggregate counts may be recorded when they are needed to explain a verified migration or safety result and do not expose private content.

## Authority and corrections

The log is a discovery aid, not a second source of truth:

- Git is authoritative for the implementation and commit history.
- Current files under `docs/` are authoritative for shipped behavior, architecture, and operations.
- GitHub issues and projects are authoritative for active planned work.
- Release tags and workflow records are authoritative for published artifacts.

When a log conflicts with one of those sources, follow the authoritative source. Preserve chronological integrity by adding a dated correction or clarification; only edit an old entry directly to fix formatting, a broken link, or accidentally recorded sensitive material.

## Parallel work

The primary agent or maintainer writes the integrated daily entry. Delegated workers should return concise evidence to the primary rather than editing the same file concurrently. If separate sessions must write in parallel, use distinct timestamped sections and reconcile them before committing.

## Historical backfills

Backfill only when explicitly requested and when reliable primary evidence exists. State the evidence used, avoid reconstructing unsupported details, and clearly distinguish fork-authored work from upstream merges.

## Suggested entry shape

```markdown
## 14:30 — Short milestone name

- **Outcome:** What changed or what was established.
- **Decisions:** Important constraints or tradeoffs.
- **Verification:** Focused automated or manual proof and its result.
- **Hosted actions:** Commit, tag, release, workflow, or deployment status.
- **Follow-up:** Remaining blocker or limitation, if any.
```

Omit empty fields. A historical reconstruction may use milestone headings instead of precise times when the evidence does not support session timestamps.
