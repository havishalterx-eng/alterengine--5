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
