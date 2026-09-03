# Build method

**Set 2026-09-03. This supersedes the multi-agent workflow used through Phase 1.**

Havish runs the build. Claude does not drive agent sessions — Havish relays.

## Who does what

Set 2026-09-03, after Claude drifted into doing the builder's job: writing the code, running the checks, opening the PR, then fixing the findings itself.

| Role | Does |
|---|---|
| **Claude — CEO** | Decides what is built next. Writes the master prompt. Reads reports. Decides accept or send back. Keeps STATUS and DECISIONS current. Settles disputes. Merges. |
| **Builder** | Writes the code and its tests. Runs build, test, gates, lint. Commits, pushes, opens the PR. Fixes what the Adversary finds. |
| **Adversary** | Runs the branch itself and verifies the builder's claims. Attacks it. Signs off or rejects. Never writes production code. |

**Claude does not write production code, run the verification, or open PRs.** When a task seems too small to delegate, it is still delegated — that exception is how the drift starts. Claude may run read-only commands to see repository state, and may edit the documents it owns.

**Why this is stricter than it sounds.** A builder report is not evidence. One report claimed "works cleanly, no package change needed" and "no interface problem"; both were wrong, and a worse interface would have shipped if the report had been trusted. The fix is not for the CEO to redo the work — it is for the Adversary to verify it. A CEO who builds and checks collapses those into one point of failure, which is what killed the previous build.

## The rules

**One component at a time.** Build it whole, finish it, close it, then move to the next. No parallel components. No partial passes left open to return to.

**UI alongside, not deferred.** After each phase Havish must be able to physically use what was built and watch it work — not read a test report about it.

**Time is not a constraint.** Never trade correctness or completeness for speed, and never propose narrowing scope to move faster.

**Dependency order still binds.** If a requested component cannot be built yet, name the dependency that blocks it and let Havish choose. Never silently reorder.

## Why this replaces the previous method

The previous build reached 114,000 lines of source and 93,000 lines of tests and never ran end to end. Its architecture was sound — its own audit said so. It failed because correct-looking components accumulated faster than anyone exercised them.

Phase 1 here ran four builders in parallel with verification by test report. It worked, but every significant defect was found *after* the code was written, by a reviewer reading it: gates that could be walked past, a build that reported clean while compiling nothing, a lint that could not fail, an audit chain that called a truncated chain valid.

Building one component at a time behind a surface a human can actually touch collapses "it looks done" and "it works" into the same claim. That is the point.

## The order

[`SEQUENTIAL-BUILD-ORDER.md`](SEQUENTIAL-BUILD-ORDER.md) lists all 49 remaining steps in strict sequence, each with the physical test that closes it.

## After a merge: reset, never rebase

**A merged branch must be reset to `origin/main`, not rebased onto it.**

Merges here are squash merges, so the branch's individual commits land on main under a single new hash. Rebasing that branch afterwards replays commits whose content is already present, and every file conflicts with itself. It looks like a serious history problem and is nothing of the kind.

```bash
cd /private/tmp/wt-<agent>
git rebase --abort            # if one is already stuck
git checkout -B agent/<name> origin/main
pnpm install && pnpm build
```

Before resetting, check the branch is genuinely merged — content, not commit hashes, since squashing changes those:

```bash
git diff --stat origin/main origin/agent/<name> -- packages apps scripts
```

Lines the branch has that main lacks are the only thing at risk. Read them. In the one case this has happened, all eight were older code main had already replaced, so nothing was lost — but that was checked, not assumed.

## What this does not change

The done gates, the ten architecture gates, `GATE_MODE=fail`, and the PARTIAL/REAL distinction all stand. `docs/build/STATUS.md` remains the single source of truth for progress, and every recorded revisit still blocks its phase gate.

`AGENT-ROSTER.md`, `SESSION-SETUP.md` and `LAUNCH-BRIEFS.md` describe the superseded workflow. They are kept as the record of how Phase 1 was actually produced, not as instructions.
