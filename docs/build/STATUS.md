# STATUS

**Single source of truth for build progress.** Not memory, not a conversation, not a recollection. If it is not written here, it did not happen.

Updated by: the Builder on completion, the Integrator on merge, the CEO on assignment.

Last updated: 2026-09-03 — **Phase 1 closed.** All six components merged, gates flipped to failing.

---

## Current phase

**Phase 2 — Walking skeleton.** Not started.

**Phase 1 closed 2026-09-03.** Six components merged, all PARTIAL. Ten architecture gates, `GATE_MODE=fail`. 92 tests against real Postgres, Redis and Temporal.

Verified on 2026-09-02, by running it, not by reading it:

- `pnpm build` — typechecks clean, TypeScript 5.9.3, strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- `pnpm test` — 28 tests pass across 4 files
- `pnpm gates` — all 5 gates run; each was proved to fire against a deliberate violation, then the fixture was removed
- `node apps/api/dist/index.js`, and the worker and sandbox equivalents, all execute
- `ALTER_RUNTIME_MODE=prod` throws rather than defaulting to something permissive
- `docker compose -f docker/compose.yml up -d` — Postgres 17.11 answered SQL, Redis round-tripped a key, Temporal reported `SERVING`
- CI run [33555200917](https://github.com/havishalterx-eng/alterengine--5/actions/runs/33555200917) — `conclusion=success` on GitHub, 9 tests passing there, not only locally

---

## Legend

| Mark | Meaning |
|---|---|
| `—` | Not started |
| `WIP` | In progress; agent and branch named |
| `REVIEW` | With the Adversary |
| `MERGE` | With the Integrator |
| `REAL` | Merged, done gate passed against real execution |
| `PARTIAL` | Merged, but materially thinner than its contract — reason recorded |
| `BLOCKED` | Reason recorded below |

**`REAL` is the only state that counts as done.** A component that compiles, passes tests, and has never run against a real dependency is not built.

---

## Phase 0 — Foundation

| Task | Owner | State |
|---|---|---|
| Repository, TypeScript monorepo, module layout | CEO | REAL |
| docker-compose: Postgres, Temporal, Redis | Integrator | REAL |
| CI skeleton, all gates in warn-only | Integrator | REAL |
| Worktree setup, one per agent | Integrator | REAL |
| Gate list defined | Adversary | REAL — review deferred to Phase 1 by decision |
| Process layout decided and all 55 mapped | CEO | REAL |

**Exit gate:** `docker compose up` starts Postgres and Temporal · CI runs and reports warnings · every agent has an isolated worktree.

**All three met. Phase 0 is closed.** Phase 1 may start.

### Ports

Offset from the defaults on purpose: the previous build's stack holds 5432–5434, 6379, 7233 and 8233 on this machine, and both need to run side by side.

| Service | Port |
|---|---|
| Postgres | 5440 |
| Redis | 6390 |
| Temporal gRPC | 7240 |
| Temporal UI | 8240 |

### Worktrees

| Path | Branch |
|---|---|
| `/private/tmp/alterengine-5` | `main` — CEO |
| `/private/tmp/wt-builder-a` | `agent/builder-a` |
| `/private/tmp/wt-builder-b` | `agent/builder-b` |
| `/private/tmp/wt-builder-c` | `agent/builder-c` |
| `/private/tmp/wt-integrator` | detached |
| `/private/tmp/wt-adversary` | detached |

### Processes

| Process | Home for | Path |
|---|---|---|
| `api` | HTTP request path, design path L1-L5, account/control | `apps/api` |
| `worker` | Run path, background drivers, recovery, learning | `apps/worker` |
| `sandbox` | Isolated computation only | `apps/sandbox` |

`library` and `browser` are the two non-process homes; `pyworker` arrives in Phase 6. Full 55-component mapping is in `docs/architecture/contracts.md`.

### What exists in code

Two shared primitives, both rule-enforcing, both tested. Nothing else.

- `packages/contracts/src/runtime-mode.ts` — the single runtime-mode switch. `assertMockAllowed()` is the only gate through which a mock may be selected, and it throws in production. Closes pattern 2.
- `packages/contracts/src/unimplemented.ts` — the absence-visible protocol. Returns `never`, so a stub that quietly returns a placeholder is a compile error rather than a review finding. Closes the stub half of pattern 1.

---

## Components — all 55

### Phase 1 — Planes
| # | Component | Owner | State |
|---:|---|---|---|
| 35 | Type/Schema Contracts | CEO+builders | **PARTIAL** — merged |
| 36 | Observability | CEO+builders | **PARTIAL** — merged |
| 37 | Safety & Policy | CEO+builders | **PARTIAL** — merged |
| 38 | Audit | CEO+builders | **PARTIAL** — merged |
| 39 | Cost Ledger | CEO+builders | **PARTIAL** — merged |
| 44 | Deletion — registration mechanism | Builder B | **PARTIAL** — merged |

### Phase 2 — Walking skeleton
| # | Component | Owner | State |
|---:|---|---|---|
| 42 | Identity & Membership | | — |
| 1 | Identity & Tenant Gateway | | — |
| 48 | Platform API / BFF | | — |
| 19 | Durable Substrate | | — |
| 16 | Run Manager | | — |
| 17 | Durable Run Queue | | — |
| 18 | Execution Workers | | — |
| 20 | Node Type Registry | | — |
| 21 | Executor | | — |
| 22 | Blackboard | | — |
| 26 | Model Gateway | | — |
| 29 | Verification — semantic only | | — |
| 52 | Run Monitor | | — |

### Phase 3 — Design path
| # | Component | Owner | State |
|---:|---|---|---|
| 46 | Workspace & Workflow Management | | — |
| 5 | ADS Store | | — |
| 11 | Capability Registry | | — |
| 4 | ADS Client | | — |
| 3 | Conversation Manager | | — |
| 6 | Problem Understanding | | — |
| 7 | Planner | | — |
| 9 | Capability Resolver | | — |
| 10 | Architecture Synthesizer | | — |
| 12 | Selection & Binding | | — |
| 8 | Clarification Loop — attended only | | — |
| 14 | Graph Compiler | | — |
| 50 | Chat & Workflow Builder | | — |
| 51 | Canvas | | — |

### Phase 4 — Real external effects
| # | Component | Owner | State |
|---:|---|---|---|
| 24 | Side-Effect Ledger | | — |
| 47 | Connection & Credential Management | | — |
| 55 | Outbox Relay | | — |
| 23 | Provisioning | | — |
| 2 | Event & Trigger Gateway | | — |
| 27 | Tool Gateway | | — |
| 49 | Public Surface | | — |
| 28 | Sandbox | | — |

### Phase 5 — Resilience
| # | Component | Owner | State |
|---:|---|---|---|
| 45 | Notification | | — |
| 40 | Eval & Red-team | | — |
| 31 | Synthesis | | — |
| 30 | Recovery Policy Engine | | — |
| 13 | Agent Factory | | — |
| 25 | Approval Store | | — |
| 53 | Approval Inbox | | — |
| 15 | Workflow Lifecycle | | — |

### Phase 6 — Learning
| # | Component | Owner | State |
|---:|---|---|---|
| 33 | Policy Store | | — |
| 32 | Memory & Learning | | — |
| 34 | Drift Detector | | — |

### Phase 7 — Completion
| # | Component | Owner | State |
|---:|---|---|---|
| 44 | Deletion & Retention — full erasure and saga | | — |
| 54 | Account & Admin | | — |
| 43 | Billing & Subscription | | DEFERRED — pricing undecided |
| 41 | Cache / Reuse | | DEFERRED — needs usage volume |

---

## Revisits — components built twice by design

**Not rework.** These cannot satisfy their full contract until a later dependency exists. Mark them at first pass or the second pass reads as scope creep and gets skipped.

| # | Component | First pass | Revisit | Done? |
|---:|---|---|---|---|
| 29 | Verification | Phase 2 — semantic only | Phase 4 — mechanical read-back via 27 | — |
| 8 | Clarification Loop | Phase 3 — attended only | Phase 5 — unattended via 45 | — |
| 44 | Deletion & Retention | Phase 1 — registration + CI gate | Phase 7 — full erasure and saga | — |
| 20 | Node Type Registry | Phase 2 — one node type | Phases 4–5 — Tool, Gate, HumanApproval, Merge | — |
| 10 | Architecture Synthesizer | Phase 3 — decides topology | Phase 6 — Policy Store informs patterns | — |
| 12 | Selection & Binding | Phase 3 — scoring | Phase 6 — learned routing weights | — |
| 1 | Identity & Tenant Gateway | Step 2 — bearer-token path only | Step 32 (component 2 lands) — trigger-originated tenant resolution, done-gate item 6 | — |
| 42 | Identity & Membership | Step 1 — RLS policies added, unproven | Step 2 — RLS enforcement proven against real per-request tenant context | — |
| 35 | Type/Schema Contracts | Phase 1 — 501 + inventory halves of gate 7 | Phase 3 — disabled-state half, once a UI exists | — |
| 36 | Observability | Phase 1 — schema, attribution shape, fail-open outage | Phase 2 — real trace across a real run; Phase 5 — alerting via 45 | — |
| 37 | Safety & Policy | Phase 1 — SSRF guard, redaction primitive, no-duplicate check | Phase 2 — injection classifier via 26; Phase 4 — PII on real egress paths | — |
| 39 | Cost Ledger | Phase 1 — no-float, idempotency, verdict field present | Phase 2 — estimate vs real cost, verdicts against runs, multi-node attribution | — |
| 38 | Audit | Phase 1 — full, four gates plus the scheduled verifier | Phase 7 — item 5b, account-deletion trigger | — |
| 35 | Type/Schema Contracts | Phase 1 — registry, derivation, inventory, coverage gate | Phase 2 — generated server mounting, real HTTP 501, handler exhaustiveness | — |

---

## Wave 2 is blocked on component 35

Components 36, 37, 38, 39 and 44-registration cannot start until 35 (Type/Schema Contracts) is merged. 35 generates the types every one of them imports; anything begun before it lands gets rewritten.

35 belongs to the CEO. Until it merges, builders run the execution check and review their own contracts for done-gate items that cannot be written as executable tests.

## Phase 1 scope

Contract reviews found that the planes' done gates were written to be verified against a running system that does not exist until Phase 2. Split into a provable-now half and a mandatory revisit — see [`PHASE-1-SCOPE.md`](PHASE-1-SCOPE.md).

**A component whose Phase 1 half passes is PARTIAL, never REAL**, and a PARTIAL component cannot be cited as a finished dependency. An unticked revisit row blocks its phase gate.

## Correction — component 35 was overclaimed

The Adversary reviewed 35 after it merged and found three defects. All three stand.

**What I claimed:** "a client method with no matching server operation is unrepresentable."

**What is actually true:** a client method with no matching *registry operation* is unrepresentable. A client method with no *running server* is entirely representable — `createClient` takes any transport, `ServerOf` is a type nobody is forced to satisfy, and no HTTP server exists yet. Done-gate item 5 is satisfied as literally written, and the defect it exists to prevent — the previous build's 117 hand-written client methods calling routes nobody built — is **not** closed.

**The 501 was client-local only.** An unimplemented operation throws before reaching the transport, which is useful, but a real `GET /workflows` reaches nothing at all. Item 7 asks for a real 501 response, meaning HTTP. That needs a server.

**`assertInventoryCovers` had no production caller.** Real, tested, and decorative — machinery with no driver, in the component whose entire job is making absence visible. Fixed: the new `capability-coverage` gate discovers route mounts by AST and requires set equality with the registry, in both directions. Built before any route exists on purpose; added later it would have to grandfather whatever had already slipped through.

**Revisit — Phase 2**, with component 48: a generated server owns all route mounting, the build fails unless every `implemented` operation has a handler, unimplemented entries mount a real 501 handler carrying the tracking reference, and the 501 is proved over HTTP rather than in a client unit test.

## Gate defects — all five evadeable

The Adversary reviewed the five architecture gates and evaded every one, four critically, with working code for each. They stay warn-only and block nobody, but **`GATE_MODE` must not flip until they are rebuilt.** Common root cause: all five match on identifier names, so any code that avoids the naming convention passes. The fix is AST plus a declared registry rather than regex over names. CEO owns it.

## Contract defects found

Recorded as found, since fixing contracts is the CEO's job alone.

**35, done-gate item 7 — cannot be fully tested in Phase 1.** It requires an unimplemented capability to return a real 501 *and* for "its interface to render a disabled state." No interface exists until Phase 3 (components 50–53). The 501 half and the inventory half are built and tested now against a genuinely unbuilt capability (`workspace.listWorkflows`, component 46). The disabled-state half is deferred to Phase 3 and must be revisited there, not quietly dropped — it is on the revisit table below.

## Blocked

*Nothing blocked.*

Record here as: component, who is blocked, on what, since when.

---

## Phase gates passed

**Phase 1 — passed 2026-09-03.** Six components merged as PARTIAL; ten gates flipped from warn to failing after measuring zero violations on main; 92 tests passing against real dependencies. Every Phase 2 revisit is recorded in the table above and blocks its own phase gate.



**Phase 0 — passed 2026-09-02.** Stack up and answering, CI green on GitHub (run 33555200917), six isolated worktrees, process layout decided and all 55 components mapped.
