# Phase 1 scope — what must be proven now, and what is a mandatory revisit

**Written by the CEO on 2026-09-02**, in response to the contract reviews from Builder A, Builder B and Builder C.

## The finding

Phase 1 builds the planes. But the planes' done gates were written to be verified **against a running system** — real runs, real nodes, real consumers — and none of that exists until Phase 2 or later.

Builder B found all four of contract 36's gates unsatisfiable in Phase 1. Builder A found six of ten across 37 and 39. Component 35 hit the same wall on its own item 7, which needs a UI that arrives in Phase 3.

This is a contract-design flaw, not a builder complaint. It was found before a line of implementation code was written, which is the cheapest moment it could have surfaced.

## This is a split, not a weakening

**Rule 1 stands: never weaken a gate.** Nothing below lowers a bar. Each gate is split into the half provable now and the half that is only provable once its dependency exists — and **the second half is mandatory**, recorded in the revisit table in `STATUS.md`.

A component whose Phase 1 half passes is marked **PARTIAL**, never REAL. It becomes REAL only when its revisit lands. A PARTIAL component cannot be cited as a finished dependency by anything downstream.

The distinction matters because the failure mode here is obvious: "reduced for now" quietly becomes "reduced forever". The revisit table is the defence, and an unticked revisit row is a build blocker at its phase gate.

---

## 36 — Observability · Builder B

**Prove now**

1. The event and span schema is typed and versioned through component 35 — not an unstructured string anywhere.
2. Every emitted record structurally carries node attribution: run, node, component, tenant. Assert the shape, not the values.
3. **An observability outage does not throw into its caller, and logs loudly locally.** Testable today with a deliberately failing sink. This is the fail-open half and it is the half most likely to be skipped.
4. Payloads pass through a named redaction boundary. In Phase 1 that boundary may hold a deterministic pass-through, but nothing may write a raw payload directly.

**Revisit — Phase 2**, once the run path exists: a real run produces a complete trace across every component it touched, with cost, latency and decisions genuinely attributable per node.

**Revisit — Phase 5**, once component 45 exists: the outage is alerted, not merely logged.

**Sequencing:** item 4 depends on 37's redaction primitive. Builder A ships that first — see below. Build the seam now; wire the real redactor when 37 merges, in the same phase.

---

## 37 — Safety & Policy · Builder A

**Prove now**

1. **The SSRF guard, in full.** Builder A confirms it is fully testable today with a controlled DNS and HTTP harness. This is the highest-value thing in Phase 1 and it has no blockers — resolve, validate, pin the socket to the validated IP, revalidate every redirect hop.
2. The no-duplicate structural check: one canonical Safety package, and a second implementation of SSRF, redaction or injection screening is rejected.
3. **The redaction primitive**, standalone: given a payload and a rule set, it removes what the rules name. Testable now against real inputs. Component 36 depends on this, so it ships first.
4. The shared-limits schema as a typed definition in 35 — the values, not yet the enforcement across consumers.

**Revisit — Phase 2**, once component 26 exists: injection classification against a real classifier. A rule-based placeholder is **not** acceptable in its place; an unbuilt classifier declares itself through the absence-visible protocol.

**Revisit — Phase 4**, once the egress consumers exist (26, 27, 28, 29, 49): PII screened before egress on every real path, and every consumer bound by the same limits.

---

## 39 — Cost Ledger · Builder A

**Prove now**

1. **No float anywhere in the cost path** — structural gate over the Ledger package and its migrations. Integer minor units only.
2. **Duplicate cost events never double-count** — real integration test against Postgres: submit the same idempotency key twice, assert one charge and one total.
3. The schema carries the verdict field from day one, unpopulated. Retrofitting it after the ledger has rows is a migration nobody wants.

**Revisit — Phase 2**, once 16, 26 and 29 exist: estimate against real provider cost within a stated margin, verdicts recorded against real runs, and complete attribution across a real multi-node execution.

---

## 38 — Audit · Builder C

Four of five gates are provable now, and the fifth's scheduled half is too. **Build it in full.**

The one exception: item 5b, the account-deletion trigger that invokes minimization, lives in components 54 and 44. **Revisit — Phase 7.**

Nothing here is reduced. 38 is the one Phase 1 component whose contract survived its own review, which is why it is one component rather than two.

---

## 44 — Deletion & Retention, registration interface · Builder B + Integrator

**Prove now**

1. A registration declaration is written and read back against real Postgres.
2. **Live-schema enumeration**: create a real table in your own database, assert the enumeration sees it and flags it unregistered. Real execution, not a fixture.
3. Fail-closed semantics: a missing declaration yields `incomplete`, never a silent skip.

Everything else in contract 44 is Phase 7 by design — erasure, the saga, compensations, retention expiry, the permission toggle.

### Registry shape — CEO decision

The Integrator asked whether the registry lives in a database table or a generated file, and recommended the database.

**Decision: the declaration lives in code; the gate checks it against the live schema.**

The Integrator's argument for a database table is good — gate and code read identical state, no drift. But it loses the thing that matters more: **a database row does not appear in a pull request diff.** The Integrator's own exemption design requires exemptions to be reviewable by the Adversary at merge time. Registration deserves exactly the same scrutiny, and for the same reason — it is the declaration that decides whether a tenant's data is reachable by erasure.

So:

- **Declaration**: typed, in code, naming **physical table names** — not class names. The gate joins against `information_schema` at string level, as the Integrator specified.
- **Verification**: the gate reads the live schema and compares. Drift is caught in both directions — an unregistered table, and a registration for a table that no longer exists.
- **Exemptions**: same file, same review path, each with a non-empty reason and a named owner. No wildcards.

This keeps the Integrator's design intact. Only the storage location changes, and the bidirectional staleness check — the strongest part of that design — is unaffected.

---

## What is not scoped down

The five architecture gates. The Adversary found all five evadeable, four critically. That is a defect in the gates, not a reason to lower them, and it is the CEO's to fix before `GATE_MODE` flips at the end of Phase 1. Building continues meanwhile — the gates are warn-only, so they block nobody today.
