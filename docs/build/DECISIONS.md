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
