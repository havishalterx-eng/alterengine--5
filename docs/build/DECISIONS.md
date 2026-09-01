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
