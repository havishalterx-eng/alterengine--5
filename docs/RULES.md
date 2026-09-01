# Full Rules

The ten always-on rules are in [`AGENTS.md`](../AGENTS.md). This is the complete set with reasoning — read when relevant, not memorised.

---

## Architectural rules

Violating any of these is an architecture bug, not a style preference.

1. **Requirements, availability, and choice are three separate concepts.** Capability Resolver states what is required; Capability Registry describes what exists; Selection & Binding picks the implementation. Collapsing any two is the most likely architectural error in the engine.

2. **The Planner emits data dependencies, never execution edges.** Architecture Synthesizer owns topology; Graph Compiler compiles it and invents nothing. If execution edges are decided upstream, the moat layer is hollow by construction regardless of implementation effort.

3. **All external interaction passes a gateway.** Nothing else holds provider credentials or imports a vendor SDK outside a provider adapter.

4. **Sandbox is isolated computation only** — no browser, database, search, or business APIs. Those belong to Tool Gateway. Code execution and external business actions have different blast radii.

5. **Durable execution is infrastructure-backed** (Temporal). No custom retry logic, no bespoke state machine, no hand-rolled replay.

6. **Verification precedes learning.** A failed run produces no learning candidate.

7. **Learning updates versioned policy, never engine code.**

8. **Recovery repairs the smallest broken layer** — provider, agent, tool, node, branch, workflow, problem.

9. **Tenant scope propagates forward** with the run. Nothing downstream re-establishes identity.

10. **Every major control-flow object is typed and versioned.** Critical state never crosses a boundary as an unstructured string.

11. **Observability is architecture**, not an afterthought.

12. **No external effect is performed without being recorded first.** If the Side-Effect Ledger is unavailable, the effect does not fire.

13. **No re-execution without consulting the idempotency gate.**

14. **Fail closed by default.** Unverifiable means failed or needs-review, never a silent pass.

15. **Absence is visible, never invisible.** A declared-but-unbuilt capability returns a real 501 with a tracking reference, renders a genuine disabled state, and is marked unimplemented in the generated inventory.

16. **No cross-database joins, no distributed transactions, no two-phase commit.** Cross-service events outside a workflow's reach go through the Outbox Relay; anything inside one is already covered by the durable substrate.

17. **Every scheduled or background capability has a named driver and a test asserting that driver exists.** A store with no writer is machinery with no driver.

18. **Every shared primitive has exactly one definition**, and the schema generates both sides of every call — a client method with no server operation is unrepresentable, not merely tested against.

19. **Safety is what you get by doing nothing.** The dangerous configuration is never the default. An unset variable must never select a mock, a bypass, or a permissive mode.

20. **Every component holding tenant data registers with Deletion & Retention**, enforced in CI, and erasure runs as a saga with compensations.

---

## The four systemic patterns

The previous build's audit found four *patterns* — not bugs, the shapes that produce bugs. Every rule above closes one.

**1. Mock code did not announce itself.** Four of six critical findings were mock implementations behind real interfaces, and not one was marked. The entire non-test codebase contained one TODO and one FIXME. That absence was read as discipline; it was just absence.

*Fix:* mandatory markers, and a CI gate failing on any mock reachable from a production entry point.

**2. Missing configuration silently selected a mock.** Identity and notifications fell through to mock providers when environment variables were absent. The notifications case was the clearest illustration of inverted priorities — a half-configured deployment crashed loudly at boot while a fully unconfigured one started happily and discarded every email.

*Fix:* a single runtime-mode switch; in production, selecting any mock is a fatal startup error.

**3. Real machinery with nothing driving it.** The most expensive pattern. A durable queue with correct leasing that no scheduler drove — a search for every scheduler primitive across the service returned zero matches. An audit chain verifier detecting all four tamper modes, with exactly one reference in the repository: its own definition. A promotion gate the audit called the best-designed component in the codebase, with zero production callers.

*Fix:* every component declares a driver, and a test asserts that driver exists.

**4. Duplicated primitives drifted apart.** Two ID validators with different strictness — which one a boundary happened to import decided what it accepted. Two packages that were literally `export {}`, linted and built on every CI run.

*Fix:* one definition per shared primitive, enforced structurally.

---

## What the previous build got right

Carried forward deliberately. Do not rewrite these.

- **Temporal for durable execution.** Its own audit: *"the single most consequential architectural decision in the system, and it is correct."*
- **DNS-pinned SSRF defence** — resolve, validate, force the socket to the validated IP, revalidate every redirect hop. Blocks private ranges, CGNAT, link-local, IPv6 ULA, cloud metadata, and the IPv4-mapped-IPv6 trap. Rated ahead of most production systems.
- **JWT validation** — algorithm pinned at both the header check and the key-import filter, issuer matched exactly, audience validated, expiry and not-before checked with bounded clock skew.
- **Row-level security with FORCE** on every tenant table, so even the table owner cannot bypass.
- **DAG validation** — Kahn's-algorithm cycle detection naming participating nodes, full referential integrity, re-validated on claim.
- **A fail-closed eval harness** — a case it cannot execute scores fail, never silently skipped, never counted as pass. An empty golden set yields 0.0, not 1.0.
- **Hash-chained audit log** — 32-byte hashes, uniqueness on the previous hash making a forked chain impossible, immutability enforced by database trigger.

---

## Working rules

- **One worktree per agent.** The previous build hit real branch collisions from shared working directories.
- **Check your branch before every commit.**
- **Never force-push. Never delete a branch.** No exceptions, no asking.
- **Branch per component:** `component/<number>-<name>`
- **Small commits.** A commit touching three components cannot be reviewed.
- **Ask before anything irreversible** — deleting data, dropping a table, rewriting history, pushing to `main`.

---

## The standard

**Volume is not progress.** The previous build produced 114,000 lines of source and 93,000 lines of tests and never ran end to end. Its architecture was sound — its own audit said so. It failed because correct-looking components accumulated faster than anyone verified them.

A component that compiles, passes its tests, and has never run against a real dependency **is not built**.
