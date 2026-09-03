# DECISIONS

**Append-only.** Every decision, as it is made, with its reasoning.

A written decision survives a context reset. A remembered one does not. If a decision only exists in a conversation, it will be re-litigated or silently reversed.

**Never edit or delete an entry.** If a decision is reversed, append a new entry that says so and why. The record of having changed your mind is itself information.

Format: date · decision · reasoning · who decided.

---

## 2026-09-02 — Repository initialised

**Decision:** `havishvardhan04-creator/alterengine--5` is the build repository. All architecture documents move into it under `docs/architecture/`. Everything an agent needs lives in the repo.

**Reasoning:** agents already have the repo checked out; documents version with the code; no path ambiguity. Shared truth cannot live in per-session memory — memory is scoped per project path, so agents in different worktrees have different memory and nothing crosses between them.

**Decided by:** Havish.

---

## 2026-09-02 — `AGENTS.md` is the canonical rules file

**Decision:** the ten always-on rules live in `AGENTS.md` at the repository root. `CLAUDE.md` contains only a pointer to it. Full rules with reasoning live in `docs/RULES.md`.

**Reasoning:** `AGENTS.md` is the cross-tool convention — Codex and opencode read it natively; `CLAUDE.md` is Claude Code's. One canonical file with two entry points means no duplication and therefore no drift. Duplicated definitions drifting apart is one of the four systemic patterns this build exists to prevent, and it applies to documentation as much as to code.

**Decided by:** Havish and Claude, jointly.

---

## 2026-09-02 — Solo build, full 55-component scope

**Decision:** all 55 components, full v1 scope. No thesis-first subset.

**Reasoning:** Claude raised scope concern and proposed a ~14-component subset to prove the moat first. Havish overruled deliberately and committed to full scope with six agents.

**Decided by:** Havish. **Not to be re-litigated.**

---

## 2026-09-02 — TypeScript, single language

**Decision:** all 55 components in TypeScript. One engine deployable plus an isolated Sandbox. Temporal external. Python only as an isolated worker for drift statistics and embeddings, called through the normal gateway pattern.

**Reasoning:** the contracts-generate-both-sides rule is materially stronger in one language — one generator, one type system, and the frontend shares generated types rather than translating them. Of 55 components only about three genuinely benefit from Python. Two languages would mean a permanent cross-language seam plus generating for both and hoping they agree, which is a weaker version of the guarantee already adopted. The previous build's Python/TypeScript split is why it needed generated gRPC clients between services at all.

**Decided by:** Havish and Claude, jointly.

---

## 2026-09-02 — Six agents, four roles

**Decision:** CEO/Contract Keeper (Claude Opus, 1) · Builder (3) · Integrator (1) · Adversary (1) · one floating agent assigned to verification during Phase 3.

**Reasoning:** the verification bottleneck is the thing to design against — the previous build was AI-assisted too and produced 114,000 lines that never ran. CEO and Contract Keeper merged because four non-building roles out of seven is too top-heavy. The floater goes to verification rather than a fourth parallel component, because Phase 3's moat chain serializes and idle build capacity is worth less than a second pair of eyes on the highest-risk work.

**Decided by:** Havish and Claude, jointly.

---

## 2026-09-02 — Gates start in warn-only mode

**Decision:** every CI gate is defined in Phase 0 in warn-only mode, and flipped to failing at the end of Phase 1.

**Reasoning:** warn-only reveals the true violation count before it blocks anyone. Flipping to failing while the count is unknown stalls the team on day two.

**Decided by:** Havish and Claude, jointly.

---

## 2026-09-02 — Build repository is `havishalterx-eng/alterengine--5`

**Decision:** the build lives at `havishalterx-eng/alterengine--5`, public. An earlier push to `havishvardhan04-creator/alterengine--5` was abandoned and that repository is being deleted.

**Reasoning:** Havish chose the `havishalterx-eng` account, which also owns `alter-x-4-`, keeping engine work under one identity. Claude flagged that the repository is public and that the architecture documents contain the competitive thesis, the pricing model, and named security defects of the previous build — some of which may relate to a still-deployed system. Havish decided public deliberately.

**Decided by:** Havish.

---

## 2026-09-02 — Stack ports offset from the defaults

**Decision:** Postgres 5440, Redis 6390, Temporal gRPC 7240, Temporal UI 8240.

**Reasoning:** the previous build's stack holds 5432–5434, 6379, 7233 and 8233 on the build machine, and roughly ten of its dev servers are still running. Both stacks need to coexist during the rebuild. Defaults would have collided on first `docker compose up` and cost an hour of confusion.

**Decided by:** Claude, recorded for reversal if the old stack is retired.

---

## 2026-09-02 — Temporal gets its own database

**Decision:** Temporal persists to a separate Postgres instance, not the application database.

**Reasoning:** resetting application data must never corrupt workflow history. It also makes rule 16 — no cross-database joins — hold by construction rather than by discipline. Nobody can accidentally join a workflow table to a tenant table if they are not in the same database.

**Decided by:** Claude.

---

## 2026-09-02 — Two shared primitives land in Phase 0, not Phase 1

**Decision:** `runtime-mode.ts` and `unimplemented.ts` ship in Phase 0, inside `@alter/contracts`.

**Reasoning:** the mock-reachability gate cannot check anything without a mock gate to check for, and every component from Phase 1 onward needs the absence-visible protocol before it can honestly declare a capability unbuilt. Both are shared primitives, so rule 18 puts them in exactly one place. This is a deliberate small expansion of Phase 0 scope; anything beyond these two waits for its phase.

**Decided by:** Claude.

---

## 2026-09-02 — Every gate must be proved to fire

**Decision:** a gate is not accepted because it reports clean. It is accepted when a deliberate violation makes it fail, with the right file, line, and message.

**Reasoning:** all five gates reported clean on an almost-empty repository, which proves nothing. A gate that has never fired is machinery with no driver — the exact pattern the gates exist to catch, reproduced in the gates themselves. Each of the five was verified against a fixture that violates it, and the fixture was then removed.

**Decided by:** Claude.

---

## 2026-09-02 — Process layout: three TypeScript processes, plus library and browser homes

**Decision:** `api`, `worker`, `sandbox` as deployables. `library` and `browser` as the other two homes, plus a deferred `pyworker`. All 55 components mapped in one table in `docs/architecture/contracts.md`, not restated per contract.

**Reasoning:** the `api`/`worker` split is forced, not chosen. Temporal workers poll task queues and run arbitrarily long activities; sharing a process with the HTTP server means one slow activity starves requests, and every "degraded, self only" blast radius on the request path becomes false. They also scale on different signals.

`library` is a real answer rather than an evasion: the planes and stores are not services, and a plane attached in-process is what makes a plane call side-channel instead of a network hop. Making them processes would invent distributed failure modes we explicitly rejected in rule 16.

Recording the mapping once rather than filling a PROCESS line in 55 contracts is rule 18 applied to documentation. Fifty-five copies of one fact drift the first time a component moves. Only one contract actually carried a PROCESS line; it now points at the table.

**Six components name two homes** — 2, 8, 12, 16, 32, 44. Each has a request-path half and a background half. A builder implementing only the visible half ships something that looks complete and has no driver, which is pattern 3. For these six the DRIVER field must name the driver in the other process.

**Decided by:** Claude, as CEO. Havish delegated the decision.

---

## 2026-09-02 — Adversary reviews the gates as its first Phase 1 task

**Decision:** the gate list ships unreviewed by the Adversary. Its review becomes the Adversary's first assignment in Phase 1, before any component review.

**Reasoning:** holding Phase 0 open for a review by an agent that has not been launched yet blocks the build on ceremony. The gates are warn-only, so a weak gate costs nothing until they flip to failing at the end of Phase 1 — which is precisely when the review will have landed. It also calibrates the Adversary session on work whose answers are already known: each gate was proved to fire against a deliberate violation, so a review that misses a real weakness tells us something about the reviewer.

The risk accepted: gates written and self-verified by the same session that wrote them carry that session's blind spots until Phase 1.

**Decided by:** Claude, as CEO. Havish delegated the decision.

---

## 2026-09-02 — Agent lineup: four IDEs, two models

**Decision:** an agent is a session in a coding IDE. Six of them across three IDEs besides Claude Code — two Codex sessions on 5.6 Terra, two opencode sessions on GLM 5.2, two Abacus AI code sessions on GLM 5.2 — plus the CEO session on Claude Code / Opus 5.

Adversary and Builder A take the two Codex/Terra sessions. Builder B and Integrator take opencode. Builder C and the Floater take Abacus.

**Reasoning:** four of the six sessions run the same model, so the differences between those four are harness differences, not model differences. Only Codex differs.

That drives the layout. The reviewer must not be the same model as the reviewed — an Adversary sharing the blind spots of the code it checks turns the review into an expensive echo. So the Adversary is the odd model out, reviewing mostly GLM-written work.

The second Codex session goes to Builder A, which carries component 37: the SSRF guard, the injection classifier, redaction. A defect there is a security vulnerability rather than a bug, which makes it the highest-consequence build in Phase 1.

The Integrator is deliberately not on Codex, because of the execution risk below.

No first-hand measurement of 5.6 Terra against GLM 5.2 on this codebase exists. The layout is reasoned from role leverage, not benchmark, and is to be revisited at the end of Phase 1 against findings-per-review and rework rate.

**Decided by:** Havish chose the IDEs and models. Claude assigned roles to them.

---

## 2026-09-02 — Every session must prove it can reach the real stack before being assigned work

**Decision:** before any agent is given a component, its session must run the five-command execution check in `AGENT-ROSTER.md` — bring the stack up, query Postgres, ping Redis, open a socket to Temporal, confirm `gh` auth. An agent that cannot complete all five is not a Builder and not the Integrator.

**Reasoning:** the entire definition of done in this project is "verified against real execution." If an IDE sandboxes network access or blocks Docker, its agent physically cannot reach Postgres on 5440 or Temporal on 7240, and everything it reports as done is fixtures wearing a real name.

That is the previous build's central failure — 114,000 lines that never ran — reintroduced through the tooling rather than through the code, and it would be invisible in every artefact we look at. A green test suite from a sandboxed agent looks exactly like a green test suite from a real one.

Codex sandboxes command execution and has historically restricted network access. Abacus is unverified here. The check costs a minute per session and is the only cheap way to find out.

**Decided by:** Claude, as CEO.

---

## 2026-09-02 — One model pinned per session; GLM 5.2 dropped entirely

**Decision:**

| Session | Role | Model |
|---|---|---|
| Codex 1 | Adversary | GPT-5.6 Terra |
| Codex 2 | Builder A | GPT-5.6 Terra |
| opencode 1 | Builder B | GLM-5.3 |
| opencode 2 | Integrator | Qwen3.8 Max |
| Abacus 1 | Builder C | Kimi K3 |
| Abacus 2 | Floater | ZAI GLM 5.3 |

Fixed per session, not switched per task.

**Reasoning:**

The original plan was GLM 5.2 in all four non-Codex sessions. That is the worst available choice, because the capability it is weakest at is the one these agents exercise constantly. GLM 5.2 scores 4.6 on Terminal-Bench 3.0 against GLM-5.3's 28.3; SWE-Marathon goes 19.4 to 42.5 and DeepSWE 46.2 to 66.9. GLM-5.3 also reaches a higher score on roughly 75k output tokens per task where 5.2 needs about 96k, so it is cheaper per unit of work as well. GLM-5.3 is present in both model lists, so the upgrade costs nothing.

The Integrator gets Qwen3.8 Max because that role is not creative work. Its entire value is refusing to merge until six specific conditions hold, and instruction-following is the metric that measures exactly that discipline — it ranks #2 of 43 models at 93.9/100, and also leads this group on SWE-Bench Pro at 67.7, which helps when judging whether a done gate genuinely passed.

Builder B gets GLM-5.3 for the strongest remaining agentic-coding profile in opencode. Builder C gets Kimi K3, the strongest model available in Abacus, on component 38 — the most discipline-sensitive build in Phase 1. The Floater gets GLM 5.3 for Phase 3, where reading a 165KB contracts document matters as much as writing code.

Pinning one model per session keeps behaviour comparable across the build, so a bad result points at something rather than dissolving into which model happened to be selected that day.

**Diversity became a real property rather than an accident.** Five distinct models across seven sessions. The Adversary now shares a model with exactly one builder instead of four, so a systematic blind spot no longer covers most of the codebase.

**Confidence and expiry.** These are vendor and aggregator figures; GLM-5.3's coverage notes independent verification is still pending, and no benchmark measures this codebase. Treat the ranking as a starting position. The evidence that matters arrives at the end of Phase 1: rework rate per builder, findings-per-review for the Adversary, and how often a session claims done on work that fails the Integrator's real-execution check.

**Also noted:** `Hy3` carries an 8x usage multiplier and `GLM-5.3-Flash` a 2x multiplier in opencode — the Flash variant costs more than the full model. None of the four chosen models carries a multiplier.

**Decided by:** Claude, as CEO, from published benchmarks. Havish supplied the available model lists.

**Sources:** thenewstack.io on GLM-5.3 post-training; evolink.ai and benchlm.ai GLM-5.2/5.3 comparisons; qubrid.com Kimi K3 vs Qwen3.8-Max; llm-stats.com; labellerr.com; codingfleet.com DeepSeek V4 Pro vs Qwen 3.7 Max.

---

## 2026-09-02 — Component 38 (Audit) design decisions

**Decision:** the audit chain is append-only at the database, not by application discipline. `prev_hash` and `entry_hash` are each 32 bytes with unique constraints on both, so a forked chain and a duplicate entry are impossible at the database. A `BEFORE UPDATE`/`BEFORE DELETE` trigger blocks every mutation unless the caller has opened the minimization path by setting the session variable `alter.allow_audit_minimization` to `on` inside a transaction. Even with the flag set, the trigger only permits the two legal mutations: nulling `payload` and setting `retention_until` (Section 18 minimization), and deleting an expired minimized skeleton. History columns are immutable even with the flag.

**Reasoning:** the previous build's verifier was correct and never called. The fix is structural: immutability lives in the trigger, the verifier is driven by a named `@driver` on a schedule in the worker process, and a test asserts the driver exists and that a scheduled run catches a deliberately tampered entry. The `@driver` tag and the driver-existence gate make "machinery with nothing driving it" a gate finding rather than a review finding.

**Decided by:** Builder C, per the CEO's brief for component 38.

---

## 2026-09-02 — Component 38 (Audit) verifier is a pure function over events

**Decision:** the chain verifier's core is `verifyEvents(events)`, a pure function; `AuditChainVerifier.verify()` reads the real chain from the store and delegates. Fork and cycle are physically impossible to insert through the real store (the unique constraints forbid them), so those two modes are tested by feeding the pure function tampered event lists, while hash-mismatch and orphan are tested against the real database by inserting tampered rows via SQL.

**Reasoning:** every failure mode must be provably caught. The database constraints are the first line of defence against fork and cycle; the verifier is the second, catching them if the constraints are ever dropped or data is restored from a tampered backup. Testing the pure function keeps that second line honest without weakening the real-execution requirement for the modes that can physically exist.

**Decided by:** Builder C.

---

## 2026-09-03 — Gates flipped from warn to fail; Phase 1 closed

**Decision:** `GATE_MODE=fail` in CI. All ten architecture gates now block a merge.

**Reasoning:** the flip was planned for the end of Phase 1 precisely so the true violation count would be known before it blocked anyone. It was measured on main against a real database first: **zero findings**. Flipping while the count was unknown would have stalled the team on day two, which is why it waited.

Ten gates, not five. The Adversary evaded all five originals, so every one was rebuilt on AST rather than identifier names. Five more were added as the build found gaps a name-matching check could never see: `capability-coverage`, `verifier-driver`, `deletion-schema`, `safety-duplicate`, `cost-no-float`.

**Decided by:** Claude, as CEO.

---

## 2026-09-03 — Phase 1 components merged

**Merged:** 35 Type/Schema Contracts, 36 Observability, 37 Safety & Policy, 38 Audit, 39 Cost Ledger, 44 Deletion registration interface.

All are marked **PARTIAL**, never REAL. Each satisfies its Phase 1 half and carries a mandatory revisit recorded in `STATUS.md`. A PARTIAL component may not be cited as a finished dependency, and an unticked revisit row blocks its phase gate.

**What the verification structure actually caught**, none of it found by the session that wrote the code:

- The Adversary evaded all five original gates, four critically, with working code for each.
- It found component 35 overclaimed: a client method with no *registry operation* is unrepresentable; one with no *running server* is not. Corrected in writing rather than quietly narrowed.
- It found `assertInventoryCovers` and `certifySchemaCoverage` had no production callers — pattern 3, twice, including once inside the component whose job is making absence visible.
- It found the root `tsconfig` never referenced two packages, so `pnpm build` reported clean while compiling neither. Adding the references surfaced four real type errors.
- It found audit chain verification called a truncated chain valid: delete the last entry and every remaining hash link is still correct. Hash linking proves what is present is consistent and says nothing about what was removed. Detecting it needed an anchor outside the data — the Postgres sequence, which never rewinds.
- Builder A found `pnpm lint` had been broken since Phase 0: wired into `package.json` with no config, so it failed before linting and looked like it passed.
- The Integrator found `STATUS.md` claiming 9 tests when there were 28.

**One Adversary finding was rejected.** It reported Alibaba's metadata endpoint `100.100.100.200` as reachable through the SSRF guard. It is not: the CGNAT rule blocks `100.64.0.0/10`, which covers `100.64` through `100.127`. Confirmed by running the predicate. A reviewer being wrong once is not a reason to trust it less — it is the reason findings get verified rather than applied.

**Decided by:** Claude, as CEO, with the Adversary as the independent check.

---

## 2026-09-03 — Adversary interface review: CHANGE FIRST, all five findings accepted

**Decision:** all five findings accepted. Two fix tasks before step 1 of the sequential build. Fix A (findings 3, 4, 5) then Fix B (findings 1, 2).

**Reasoning:** the review asked a different question from the last one — not "is this correct" but "what breaks when Phase 2 calls this". Four Phase 1 components are libraries whose consumers all arrive later, so an interface mistake is free to fix now and expensive after ten call sites exist.

**Finding 3 is the most serious thing found today, and it is a defect the CEO introduced.** `Observer.emit` accepts `unknown`, the schema accepts arbitrary payload values, and the worker sink calls `JSON.stringify`, which throws on a `bigint`. The observer catches that and drops the record. Cost is stored as `bigint`, so the first cost record Model Gateway emits would silently disappear while everything looked healthy. Machinery that appears to work and quietly loses data is precisely the previous build's disease.

**Finding 4 is half a fix, also the CEO's.** The `scope` discriminator added hours earlier resolved tenant ambiguity and left run ambiguity untouched: `runId: 'system:worker'` is a fabricated run that Run Monitor will render as real at step 13.

**Finding 1 is the most consequential for the product.** The SSRF guard is genuinely good — DNS-pinned, socket forced to the validated IP, every redirect hop revalidated — and its safe path accepts only a URL and hardcodes GET. Model Gateway must POST with an Authorization header, so the first real consumer would bypass it. A security control that the easy path routes around is not a control.

**Finding 2 blocks a claim already made in contract 43.** Verified-run billing is only honestly claimable if a verdict is recorded against a cost, and today `record()` fixes the verdict to null and ignores conflicts, so a verdict can never be attached.

**Nothing is deferred to "when the consumer exists".** That reasoning is what produces rework, and the whole point of running this review before step 1 was to avoid it.

**One thing deliberately NOT changed:** `emit()` returns no delivery outcome. Observability is best-effort by design, and a return value a caller could mistake for a guarantee would be worse than none. Cost Ledger and Audit remain the authoritative writes.

**Decided by:** Claude as CEO, on the Adversary's verdict.

---

## 2026-09-03 — PR #5 rejected on independent review; sent back

**Decision:** PR #5 (fix/observability-shape) not merged. Two findings from the Adversary's review, both verified real, sent back to the builder rather than fixed by the CEO.

**Reasoning:**

**The compile-time fix for finding 3 did not close the runtime hole it was meant to close.** `emit()` now rejects a `bigint` payload at compile time, but the runtime validator checks JSON-safety with `Object.values`, which does not distinguish a plain object from a `Map`, a `Set`, or a class instance. The Adversary proved a `Map` payload is accepted, then silently becomes `{}` at the sink. Anyone constructing a payload dynamically rather than as a literal bypasses the compile-time check entirely and hits the same silent data loss the fix was supposed to remove.

**The report claimed a mechanism that does not exist.** `schema.ts` states cost telemetry is "parsed back with `BigInt()`," and the Adversary found no such consumer — the only `BigInt()` usage parses an unrelated SQL aggregate. Model Gateway, the real consumer, does not arrive until Phase 2, so the absence may be correct; the false claim in the comment is not. A comment describing a mechanism that isn't there is worse than a comment saying it doesn't exist yet.

**This is the process working as designed, not a setback.** The CEO does not verify or fix builder reports directly — that collapsed build and check into one point of failure on the previous task. Sending it back to the builder, with the Adversary's exact repro steps, is the correct response to a REJECT.

**Decided by:** Claude as CEO, on the Adversary's verdict.

---

## 2026-09-03 — PR #5, third REJECT: escalated from patching to replacing

**Decision:** four new findings on round 2, all real, all the same defect class as round 1 — a value slipping past a runtime JSON-safety check that was never exhaustive. Not sent back as another individual patch. The builder is told to replace `isJsonSafe` with a descriptor-based recursive validator and prove exhaustiveness with an adversarial test suite it writes itself.

**Reasoning:** the pattern across three rounds is diagnostic, not coincidental. Round 1: `Map` slips past `Object.values`. Round 2, after that specific fix: Symbol keys, sparse arrays, extra array properties, and a throwing getter — four more ways past the same `Object.values()` / `.every()` shape. Each round fixed exactly the case demonstrated and left the mechanism itself unchanged, because iterating with those two methods was never going to be exhaustive; they were built to walk normal data, not to certify the absence of abnormal data.

Continuing to send back one-finding-at-a-time patches would very likely produce a fourth review finding a sixth hole — a Proxy, a getter defined via `Reflect.defineProperty` after construction, a frozen object containing one of the earlier cases nested. The fix is architectural: never read a property's value until its descriptor is confirmed to be a plain enumerable data property. That single rule closes the getter-throws finding directly and makes the Symbol and sparse-array findings fall out as a consequence, rather than requiring their own special case.

**The builder is asked to prove exhaustiveness itself**, with cases beyond what the Adversary has already tried, rather than the CEO or Adversary continuing to be the only source of new failing inputs. Finding new cases is the actual evidence the approach generalises.

**Decided by:** Claude as CEO, on three consecutive Adversary verdicts.

---

## 2026-09-03 — PR #5 approved on round 4, verified by the CEO directly

**Decision:** PR #5 merged. The Adversary tool was unavailable for round 4. Havish instructed the CEO to run the review itself rather than wait — a stated, explicit exception, not a return to the CEO doing builder work.

**Verification performed, all independent — nothing accepted from the report on trust:**

- Built the branch fresh, 107 tests run directly (not the builder's reported count), all pass
- Ran the observability suite in isolation first: 19 tests, real
- Five attacks beyond the round-4 prompt's list, run through `emit()` on the real path rather than the internal function: an object mutated with a `Map` after a prior successful emit, a getter that redefines its own descriptor as a side effect of being read, an array-like object, a symbol key mixed with a string key, and a getter added to an already-validated nested object. All five held — no throw into the caller, no silent acceptance.
- The one apparent "accepted" case — an array-like object `{0,1,length}` — checked against `JSON.stringify` of the same value and found to serialize identically. Not a defect: the validator correctly treats it as a plain object, not an array, and there is no divergence between what was validated and what is written.
- Confirmed the zod-parse guard exists exactly where the report claims, by reading the source rather than trusting the description.
- Reproduced the teardown fix independently: moved `.env` aside myself, ran both files, got one `ConfigurationError` each and zero `TypeError`s.
- Re-confirmed round 1's compile-time bigint check by deleting the `@ts-expect-error` line myself and watching the build fail with the exact quoted error, then restoring it.
- All 11 gates clean, lint clean, with `DATABASE_URL` genuinely exported rather than assumed from a stale `.env`.

**One real mistake in this process, caught and corrected before it affected the verdict:** the CEO's own worktree had no `alter_adversary` database and no `.env`, which produced six false test failures and one false gate finding on the first run. Diagnosed as an environment gap in the reviewer's own setup, not a defect in the branch, and fixed before drawing any conclusion — the same discipline being asked of every builder report was applied to the CEO's own environment.

**VERDICT: APPROVE.**

**Decided by:** Claude as CEO, performing the Adversary's verification directly at Havish's explicit instruction, with the same standard the Adversary has held every prior round: nothing accepted without independent reproduction.

---

## 2026-09-03 — PR #6 approved, verified by the CEO directly

**Decision:** PR #6 merged. The Adversary tool was unavailable again; Havish instructed the CEO to run the review itself. Same explicit, stated exception as PR #5's round 4, not a standing practice.

**Verification performed, all independent:**

- Fresh build, **140 tests run directly**, 17 files, all pass
- Redirect credential stripping tested against real HTTP servers with an attack beyond the builder's own proof: a 3-hop chain with a same-origin hop followed by a cross-origin hop. The credential survived the same-origin hop and was stripped exactly at the cross-origin one — confirms the guard is not over-stripping on same-origin redirects, which the builder's report did not demonstrate either way.
- Read `validatedResponseLimit` directly: the cap is enforced by an unconditional clamp to `[1, MAX_RESPONSE_BYTES]`, and the constant is not exported from the package barrel, so no caller can reference or raise it. Read `readResponse` directly: it checks length per streamed chunk and destroys the connection on overflow — genuinely streamed, never buffers the full body before checking.
- Cost Ledger race condition tested against real Postgres, not asserted sequentially: two concurrent `attachVerdict` calls with different verdicts on the same cost produced exactly one winner and a real `VerdictConflictError` on the loser. Confirmed idempotent replay of the winning verdict, and confirmed `attachVerdict` on a nonexistent key throws `CostNotFoundError` rather than creating a row.
- **Judged, not just verified, the `@driver requestPinned` tag** the builder used to resolve a `driver-existence` gate finding on a per-request timeout. Read the code directly: the timer arms and clears entirely within one caller-driven request, with no persistence beyond it — structurally different from the background-machinery pattern the gate exists to catch. The reasoning is stated plainly in a comment for a future reader, not hidden. Judged legitimate, not a workaround that erodes the gate's meaning.
- Re-ran the SSRF test suite in isolation to confirm nothing from the original review — DNS rebinding, private ranges, IPv4-mapped IPv6, metadata endpoints — regressed: 24/24 still pass.
- All 11 gates clean, lint clean, with `DATABASE_URL` genuinely exported this time rather than repeating the environment mistake from the PR #5 review.

**VERDICT: APPROVE.**

**Decided by:** Claude as CEO, performing the Adversary's verification directly at Havish's explicit instruction.

---

## 2026-09-03 — PR #7 (component 42) rejected; RLS decision made

**Decision:** PR #7 not merged. One defect found by independent verification, not covered by the builder's own done gate. RLS question the builder explicitly asked for is decided: table-level RLS with FORCE is added now, on the tables this component creates; the enforcement TEST is deferred to step 2, because per-request tenant context is component 1's to supply and a local Postgres superuser bypasses RLS regardless.

**The defect:** `transferOwnership` updates only `accounts.owner_user_id`. It does not create a membership row for the successor. `createAccount` deliberately gives its founder BOTH `owner_user_id` and an Admin membership — the store's own comment says so — but `transferOwnership` does not mirror that.

The result, reproduced against real Postgres: transfer ownership to a user who has never been a member of the account, and `resolvePermissions()` returns `null` — indistinguishable from "not a member" — while `can()` for an owner-only action correctly returns `true` via its independent `owner_user_id` fallback. The new owner can perform owner-only actions one at a time through `can()`, but cannot see their own permission set, cannot create a workflow, cannot invite anyone. The CLI's `member show`, which is the physical test for this whole step, would report them as not found.

**Why this was not caught by the builder's own done gate.** Item 2 states "Owner: yes. Transfer moves them" — but that was tested by transferring ownership to a user who was already a member (an Admin, per the physical-test transcript). The untested path is a transfer to a genuine non-member, which is not a hypothetical: it is the shape of the very attack the AGENTS.md rules ask every reviewer to consider.

**RLS decision:** add RLS with FORCE to `accounts`, `memberships`, and `custom_roles` now. The Rules doc calls out RLS-with-FORCE as something the previous build got right and worth carrying forward; deferring it entirely to "when component 1 exists" risks it being retrofitted onto live tables later, which is exactly the failure mode rule 20's registration gate exists to prevent for a different resource. The enforcement test genuinely cannot be meaningful until component 1 supplies real per-request tenant context — that half is deferred, not the policies themselves.

**Not flagged, checked and found clean:** custom-role isolation is real SQL-level scoping (`WHERE account_id = $1`), not an application-level filter; the `no-console` eslint carve-out is scoped exactly to `packages/*/src/cli.ts`, matching the existing `scripts/**` precedent.

**Decided by:** Claude as CEO, performing the Adversary's verification directly at Havish's explicit instruction — the tool was unavailable.

---

## 2026-09-03 — PR #7 approved, verified by the CEO directly

**Decision:** PR #7 (component 42) merged. Adversary tool still unavailable; same explicit exception as rounds prior.

**Verification performed, all independent:**

- Fresh build, **154 tests run directly**, 18 files, all pass
- Reproduced the exact defect scenario from round 1: transfer to a genuine non-member, existing user. `resolvePermissions()` now returns a real ten-permission set with `isOwner: true`; `can(create_workflow)` returns `true`. The previous owner correctly drops to `isOwner: false` while keeping their Admin membership.
- Reproduced the builder's own additional scenario — transfer to a brand-new email never seen before — independently, not on trust. Passed.
- **Tested atomicity beyond what either report claimed**, not just read the `BEGIN`/`COMMIT`/`ROLLBACK` structure: forced a real failure (transfer against a nonexistent account) and confirmed the user row created earlier in the same transaction was NOT committed — genuine rollback, not a partial write papered over by error handling.
- **Verified RLS against the live schema directly**, `pg_class` and `pg_policies`, not the builder's own existence test: `relrowsecurity` and `relforcerowsecurity` both true on `accounts`, `memberships`, `custom_roles`; `users` correctly excluded; the policy predicate matches what was claimed.
- **Went further than either report's proof**: created a genuine non-superuser Postgres role and connected as it directly, rather than trusting that FORCE would work as designed. Confirmed zero rows with `app.current_account` unset, and confirmed exactly one row returned when the setting matched a real account. This proves the policy is substantively correct — not merely present — for the one connection type (non-superuser) that will eventually use it, even though the builder's own disclosed gap (the `alter` role used by every builder today is a superuser, and RLS does not apply to it) is confirmed accurate and remains unresolved until step 2's per-request context exists.
- Gates and lint clean.

**VERDICT: APPROVE.**

**Decided by:** Claude as CEO, performing the Adversary's verification directly at Havish's explicit instruction.

---

## 2026-09-04 — Step 2 (component 1) scope: JWT belongs in Safety; trigger path deferred

**Decision:** two scoping calls made before issuing step 2, the same discipline as PHASE-1-SCOPE.md.

**JWT validation is a new shared primitive, built into `@alter/safety`, not into `@alter/identity`.** Contract 1 lists Safety & Policy as a plane dependency specifically for JWT validation, and no JWT code exists anywhere in the repo yet. Rule 18 — one definition per shared primitive — means it must live in one place from the start; component 1 consumes it rather than embedding its own copy. Public Surface (component 49) and any future component that verifies a bearer token will import the same implementation. Use an established library (`jose`) for the cryptography rather than hand-rolling signature verification — the previous build's audit specifically praised algorithm pinning at both the header check and the key-import filter, which is exactly the class of mistake a library gets right and a hand-rolled parser easily gets wrong.

**Done-gate item 6 (trigger-originated tenant resolution) is scoped to its typed shape now, its end-to-end proof deferred.** The contract's own definition of that path depends on workflow-ownership facts (component 46, step 14, Phase 3) and on Event & Trigger Gateway actually producing a workflow reference (component 2, step 32, Phase 4). Neither exists yet. Building a real end-to-end test for this today would mean fabricating both inputs, which produces a test that looks like proof and is not — the exact previous-build failure this rebuild exists to prevent. The entry point and its typed contract are built now, so nothing later has to retrofit the shape; the done-gate proof is a mandatory revisit at step 32.

**Component 1 also owes the RLS enforcement proof deferred by component 42.** This is precisely the component that will supply real per-request tenant context (`app.current_account`), and it is the first thing in the sequence that runs as a non-superuser-equivalent boundary. The proof belongs here, not postponed further.

**Decided by:** Claude as CEO.
