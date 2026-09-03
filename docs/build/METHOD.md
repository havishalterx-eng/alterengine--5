# Build method

**Set 2026-09-03. This supersedes the multi-agent workflow used through Phase 1.**

Havish runs the build. Claude does not drive agent sessions and does not assign work.

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

## What this does not change

The done gates, the ten architecture gates, `GATE_MODE=fail`, and the PARTIAL/REAL distinction all stand. `docs/build/STATUS.md` remains the single source of truth for progress, and every recorded revisit still blocks its phase gate.

`AGENT-ROSTER.md`, `SESSION-SETUP.md` and `LAUNCH-BRIEFS.md` describe the superseded workflow. They are kept as the record of how Phase 1 was actually produced, not as instructions.
