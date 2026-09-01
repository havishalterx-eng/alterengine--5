# Alter Engine — Agent Rules

**Canonical rules file. Read before doing anything.** Applies to every agent on this project regardless of tool — Claude Code, Codex, opencode, or any other.

---

## Before you write code

Read, in order:

1. **This file**
2. `docs/roles/<your-role>.md` — what your role does and does not do
3. `docs/build/STATUS.md` — what is done, in progress, and blocked right now
4. `docs/build/build-order.md` — your phase only
5. `docs/architecture/contracts.md` — the section for your assigned component

Then **state, before writing any code**: your role, your component number, the contract section, the done-gate items you must satisfy, and the files you read.

If your task is a pointer you cannot resolve, **ask**. Do not infer.

---

## The ten rules

1. **Never weaken a gate to unblock work.** A blocking gate means either the code is wrong or the contract is wrong. Both are CEO decisions. Escalate.
2. **Done means verified against real execution.** Never fixtures, never mocks, never "the test passes."
3. **No mock reachable from a production entry point**, and none shipped in a bundle. Development interception is allowed at the network layer only, and its responses must be *recorded from real ones*, never hand-authored.
4. **Contracts are law.** Only the CEO/Contract Keeper edits `docs/architecture/contracts.md` or defines a gate. If a contract is wrong, say so — do not work around it.
5. **Stay inside your assigned component.** Do not edit another component to make yours work. If you need a change there, raise it.
6. **Every scheduled or background capability has a named driver and a test asserting that driver exists.** A store with no writer counts as machinery with no driver.
7. **Fail closed.** Never claim a success you did not verify. Never let absence look like data — an unbuilt capability returns a real 501 with a tracking reference and is marked unimplemented in the inventory.
8. **The Planner emits data dependencies, never execution edges.** No node types, no `depends_on`, no entry point. Topology belongs to the Architecture Synthesizer. This boundary is the product's moat; eroding it silently makes the whole design pointless.
9. **One worktree per agent. Check your branch before every commit.** Never force-push. Never delete a branch.
10. **Ask before anything irreversible** — deleting data, dropping a table, rewriting history, pushing to `main`.

Full rule set with reasoning: `docs/RULES.md`.

---

## Where truth lives

| Question | File |
|---|---|
| What am I building? | `docs/architecture/contracts.md` |
| In what order, and with whom? | `docs/build/build-order.md` |
| What is done right now? | `docs/build/STATUS.md` |
| Why was something decided? | `docs/build/DECISIONS.md` |
| How do the pieces fit? | `docs/architecture/whole.md` · `layers.md` · `planes.md` |
| Why does the design look like this? | `docs/architecture/design-log.md` |

**`STATUS.md` is the single source of truth for progress.** Not your memory, not this conversation. If you complete a component, update it. If you are blocked, record it there.

**Write decisions to `DECISIONS.md` as you make them.** A written decision survives a context reset; a remembered one does not.

---

## What this project is

Alter Engine takes a business problem, decides what system should exist to solve it, builds and runs that system durably, verifies the real-world outcome, repairs failures at the smallest broken layer, and learns safely — without a human hand-designing the workflow.

**55 components. Eight build phases. TypeScript.** One engine deployable plus an isolated Sandbox; Temporal is external.

**The previous build failed not from bad architecture but from four systemic patterns** — mock code that did not announce itself, missing config silently selecting a mock, real machinery that nothing ever drove, and duplicated primitives that drifted apart. Every rule above exists to make one of those impossible. That build produced 114,000 lines and never ran end to end.

**Volume is not progress.** A component that compiles and has never run against a real dependency is not built.
