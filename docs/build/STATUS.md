# STATUS

**Single source of truth for build progress.** Not memory, not a conversation, not a recollection. If it is not written here, it did not happen.

Updated by: the Builder on completion, the Integrator on merge, the CEO on assignment.

Last updated: 2026-09-02 — repository initialised.

---

## Current phase

**Phase 0 — Foundation.** No components. Scaffolding only.

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
| Repository, TypeScript monorepo, module layout | CEO | WIP |
| Process layout decision recorded | CEO | — |
| `PROCESS` field filled on all 55 contracts | CEO | — |
| docker-compose: Postgres, Temporal, Redis | Integrator | — |
| CI skeleton, all gates in warn-only | Integrator | — |
| Worktree setup, one per agent | Integrator | — |
| Gate list defined and reviewed | Adversary | — |

**Exit gate:** `docker compose up` starts Postgres and Temporal · CI runs and reports warnings · every agent has an isolated worktree.

---

## Components — all 55

### Phase 1 — Planes
| # | Component | Owner | State |
|---:|---|---|---|
| 35 | Type/Schema Contracts | CEO | — |
| 36 | Observability | | — |
| 37 | Safety & Policy | | — |
| 38 | Audit | | — |
| 39 | Cost Ledger | | — |
| 44 | Deletion — registration mechanism | | — |

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

---

## Blocked

*Nothing blocked.*

Record here as: component, who is blocked, on what, since when.

---

## Phase gates passed

*None yet.*
