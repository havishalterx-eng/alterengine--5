# Alter Engine — Build Order

Eight phases, 55 components, four agent roles. Derived from the dependency graph in the component contracts, not from layer numbering — **L1 is not built first, and that is deliberate.**

Companion to `alter-engine-component-contracts.md` (what each component must do) and `alter-engine-whole-architecture.md` (how they fit). This document says **in what order, by whom, and what proves each phase is finished.**

Written 2026-09-02.

---

## The roles

| Role | Count | Owns | Never does |
|---|---:|---|---|
| **Contract Keeper** | 1 | The schema, code generation, gate definitions. The only role permitted to edit contracts or add a gate. | Implement components |
| **Builder** | 3 | Implements one component against its contract, until its done gate passes against real execution. | Edit contracts, weaken a gate, touch another builder's component |
| **Integrator** | 1 | docker-compose, CI, real-execution runs, merges. **Nothing merges without passing here.** | Implement components |
| **Adversary** | 1 | Reviews only. Hunts contract violations, unmarked stubs, undriven machinery, boundary erosion. | Write production code |

### Standing rules

1. **One worktree per agent.** No shared working directory — the previous build hit real branch collisions from exactly this.
2. **A Builder's task is a contract plus its done gate**, never a prose description. If the done gate cannot be written as an executable test, the contract is wrong — escalate to Contract Keeper, do not proceed.
3. **The Adversary reviews before the Integrator merges**, not after.
4. **A gate is never weakened to unblock work.** If a gate blocks, either the code is wrong or the contract is wrong. Both are Contract Keeper decisions.
5. **No component is "done" on passing tests alone** — it is done when the Integrator has run it against real dependencies and seen it work.
6. **Every phase has an exit gate.** The next phase does not begin until it passes.

---

## Phase 0 — Foundation

**No components. Nothing else can be parallelised until this exists.**

| Task | Role |
|---|---|
| Repository, TypeScript monorepo, module layout mirroring the 55 components | Contract Keeper |
| Process layout decision recorded — one engine deployable plus isolated Sandbox; Temporal external | Contract Keeper |
| `PROCESS` field filled on all 55 contracts | Contract Keeper |
| docker-compose: Postgres, Temporal, Redis | Integrator |
| CI skeleton with every gate in **warn-only** mode | Integrator |
| Worktree setup, one per agent | Integrator |
| Gate list defined and reviewed | Adversary |
| Builders: read the contracts. No code. | Builder ×3 |

**Gates defined now, warn-only, flipped to failing at the end of Phase 1:**
- No file outside a test directory imports a mock module
- No cross-module import that violates a component boundary
- No vendor SDK outside a provider adapter
- Exactly one validator per shared primitive
- No generated client method without a matching server operation
- Every scheduled capability has a driver test
- Every component holding tenant data is registered
- Planner output carries no execution edge, node type, or entry point
- Exactly one compile entry point

**EXIT GATE** — `docker compose up` starts Postgres and Temporal; CI runs and reports warnings; every agent has an isolated worktree.

> **Warn-only first is deliberate.** It reveals the true violation count before it blocks anyone. Flipping to failing while the count is unknown stalls the whole team on day two.

---

## Phase 1 — Planes before components

**Everything registers with, or calls, these. Building them after the components that depend on them is how the previous build ended up with registrations nobody enforced.**

| # | Component | Role | Notes |
|---|---|---|---|
| 35 | Type/Schema Contracts | **Contract Keeper** | Generation working end to end. Emits the capability inventory |
| 36 | Observability | Builder A | Injected everywhere from here on |
| 37 | Safety & Policy | Builder B | Shared in-process library. SSRF guard, injection classifier, redaction |
| 38 | Audit | Builder C | Hash chain plus **the scheduled verifier and its driver** |
| 39 | Cost Ledger | Builder A | Integer minor units. Round once. **Verdict field present from day one** |
| 44 | Deletion & Retention — *registration mechanism only* | Builder B | The interface and the CI gate. Full erasure and saga come in Phase 7 |

**Parallel:** 36, 37, 38, 39 run concurrently after 35 lands. **35 is a hard blocker on everything.**

**EXIT GATE**
- Schema generates client and server; deleting a route removes its client method
- Inventory lists capabilities with status
- A tenant table added without registration **fails the build**
- Audit chain verification runs on a schedule and catches a tampered entry
- **All Phase 0 gates flip from warn to failing**

---

## Phase 2 — Walking skeleton

**Thinnest path that runs end to end. The design path is deliberately skipped — hand-write a `WorkflowDAG` and feed it to the runtime.** Proving the spine before building the thing that generates it.

| # | Component | Role |
|---|---|---|
| 42 | Identity & Membership | Builder A |
| 1 | Identity & Tenant Gateway | Builder A |
| 48 | Platform API / BFF | Builder B |
| 19 | Durable Substrate — wire Temporal | Builder C |
| 16 | Run Manager | Builder C |
| 17 | Durable Run Queue | Builder C |
| 18 | Execution Workers | Builder C |
| 20 | Node Type Registry — one node type only | Builder B |
| 21 | Executor | Builder B |
| 22 | Blackboard | Builder A |
| 26 | Model Gateway | Builder A |
| 29 | Verification & Quality Gate | Builder B |
| 52 | Run Monitor — thin | Builder C |

**Sequencing inside the phase:** 42 → 1 → 48 first (nothing works without identity). Then 19 → 16 → 17 → 18 as one chain by a single builder — these are tightly coupled and splitting them across agents costs more than it saves. 20, 21, 22 next. 26 and 29 can start in parallel early.

**EXIT GATE — the hardest one in the whole plan**
- A real member with a real role resolves to a **non-empty permission set**
- A hand-written DAG executes one node end to end against real Temporal
- **A queued run dispatches with nothing else happening in the system**
- A transient database error during dispatch does **not** delete the queue entry
- The node's output passes verification; an unverifiable result is marked failed
- Run Monitor shows real streamed events matching actual run history
- Cost is attributed with the verification verdict recorded

**Adversary focus:** every mock, every stub, every "TODO later" in this phase. This is where the previous build's rot started.

---

## Phase 3 — The design path, and the thesis

**The moat. Everything before this was infrastructure.**

| # | Component | Role |
|---|---|---|
| 46 | Workspace & Workflow Management | Builder A |
| 3 | Conversation Manager | Builder A |
| 5 | ADS Store | Builder C |
| 4 | ADS Client | Builder C |
| 6 | Problem Understanding | Builder B |
| 7 | Planner | Builder B |
| 9 | Capability Resolver | Builder B |
| 10 | **Architecture Synthesizer** | **Builder B** |
| 11 | Capability Registry | Builder C |
| 12 | Selection & Binding | Builder C |
| 14 | Graph Compiler | Builder A |
| 8 | Clarification Loop | Builder A |
| 50 | Chat & Workflow Builder | Builder A |
| 51 | Canvas | Builder A |

**Builder B owns 6 → 7 → 9 → 10 as one chain.** These four define the moat boundary and splitting them across agents guarantees the boundary erodes. One agent, one mental model, one sequence.

**EXIT GATE — plus the thesis gate**
- Planner output contains **no execution edge, node type, or entry point** — asserted against the schema
- **One `TaskRequirement` set produces two genuinely different `ArchitectureSpec` outputs** under cost-constrained versus latency-constrained profiles. Different topology, not different labels
- Every path to a compiled workflow passes through the Synthesizer — no bypass exists
- A described workflow is built, compiled, and runs end to end
- Canvas load-then-save round-trips the real DAG unchanged
- **The thesis gate runs:** golden set of 20–30 objectives, baseline arm versus scored-Synthesizer arm, both actually running, success rate judged by Verification, Fisher exact with a **minimum detectable effect stated in advance**

> **This is the decision point of the entire project.** If the two-profile test fails, the boundary is still fake and the moat does not exist — stop and fix the boundary rather than continuing to build on it. If the thesis gate comes back inconclusive rather than negative, that is an experiment-power problem, not a product failure. Know the difference before you run it.

---

## Phase 4 — Real external effects

**Until now nothing has touched a real outside system.**

| # | Component | Role |
|---|---|---|
| 47 | Connection & Credential Management | Builder A |
| 27 | Tool Gateway | Builder B |
| 24 | Side-Effect Ledger | Builder B |
| 2 | Event & Trigger Gateway | Builder C |
| 49 | Public Surface | Builder C |
| 55 | Outbox Relay | Builder A |
| 23 | Provisioning | Builder C |
| 28 | Sandbox | Builder B |

**24 must land before or with 27.** No external effect may fire before the ledger that records it exists — that ordering is a hard constraint, not a preference.

**EXIT GATE**
- A real external action fires, with intent recorded before and confirmation after
- **Verification reads that same action back independently** through Tool Gateway
- SSRF defence blocks DNS rebinding and metadata endpoints against real attack shapes
- Response size limits enforced by default; no unbounded fetcher can be constructed
- A scheduled trigger fires on time, unprompted
- Flooding Public Surface does not degrade authenticated use
- An outbox event publishes with nothing else happening, and survives killing the relay mid-flow
- A credential expiry warning fires before expiry

---

## Phase 5 — Resilience

**Now that things can break in real ways, build the machinery that fixes them.**

| # | Component | Role |
|---|---|---|
| 30 | Recovery Policy Engine | Builder B |
| 13 | Agent Factory | Builder B |
| 25 | Approval Store | Builder A |
| 53 | Approval Inbox | Builder A |
| 45 | Notification | Builder C |
| 31 | Synthesis | Builder C |
| 15 | Workflow Lifecycle | Builder C |
| 40 | Eval & Red-team | Builder A |

**45 lands before or with 25 and 30** — both need delivery to a human, and an approval nobody sees is an approval that never fired.

**Builder B takes 30 and 13 together.** Agent Factory is called by Recovery; they are one problem.

**EXIT GATE**
- Each of the five Classify buckets classifies correctly against real failures of that type
- A transient error retries and succeeds — **never treated as terminal**
- A credential gap hard-stops with a clear explanation rather than futile self-healing
- **The idempotency gate prevents a duplicate effect on retry**, verified with a real partially-completed workflow
- `recompile` repairs a branch **without** a full replan
- **A live run, mid-failure, creates a new agent, binds it, and resumes** — the genuinely unproven one
- Timeout-mode approval fires with no human present
- The promotion gate actually runs on a production promotion
- Every red-team suite genuinely executes and can both pass and fail

---

## Phase 6 — Learning

| # | Component | Role |
|---|---|---|
| 32 | Memory & Learning | Builder A |
| 33 | Policy Store | Builder B |
| 34 | Drift Detector | Builder C |

**EXIT GATE**
- **A failed run produces no learning candidate**
- Provenance is independently confirmed, not trusted from the caller
- Every candidate carries a confidence score
- A global-scope write carrying tenant content **fails loudly**
- Versioning and rollback genuinely work — a bad policy reverts and behaviour returns
- Scheduled drift evaluation runs unprompted; insignificant variation does not trigger decay
- No suggestion is ever auto-applied

---

## Phase 7 — Completion

| # | Component | Role |
|---|---|---|
| 44 | Deletion & Retention — full erasure and saga | Builder A |
| 54 | Account & Admin | Builder B |
| 43 | Billing & Subscription | *deferred — pricing undecided* |
| 41 | Cache / Reuse | *deferred — needs usage volume* |

**EXIT GATE**
- Erasure covers every registered component, verified by checking **what exists afterward**
- **Run the saga with one service failing: the verifier reports incomplete, never complete**
- Retention expiry runs on schedule
- Lowering a retention window states what will be destroyed and requires the correct permission
- Deferred components return a real 501 with a tracking reference, render a disabled state, and are marked unimplemented in the inventory

---

## Why this order, not layer order

**Planes first.** Everything registers with or calls them. Building components first means retrofitting registration, which is how the previous build's deletion list went stale.

**Skeleton before design path.** The design path is the hardest and most valuable part. Building it on an unproven runtime means debugging two unknowns at once.

**Effects before resilience.** Recovery cannot be tested without real failures, and real failures need real external systems.

**Learning last.** It depends on verified outcomes, which depend on everything else working.

**The thesis gate sits at the end of Phase 3, not the end of the project.** Roughly 30 of 55 components are still unbuilt at that point — so if the moat does not hold, you learn it with 25 components of work still uncommitted rather than 55.

---

## Parallelism — full wave map

Each phase breaks into **waves**. Everything inside a wave runs concurrently. A wave does not start until the previous one lands.

---

### Phase 1 — Planes

```
WAVE 1   35 Contracts                          ← Contract Keeper, alone
              │  blocks literally everything
              ▼
WAVE 2   36 Observability    │ Builder A
         37 Safety & Policy  │ Builder B        all four concurrent
         38 Audit            │ Builder C
         39 Cost Ledger      │ Builder A
         44 registration     │ Contract Keeper + Integrator (CI gate, not a build task)
```

**Why 35 is alone:** it generates the types every other component imports. Anything started before it lands gets rewritten.

---

### Phase 2 — Walking skeleton

Three independent tracks. **Each track stays with one builder start to finish** — they are chains, not pools.

```
TRACK A · identity spine          TRACK B · runtime chain        TRACK C · leaves
Builder A                         Builder C                      Builder B

42 Identity & Membership          19 Durable Substrate           20 Node Type Registry
        │                                 │                      22 Blackboard
        ▼                                 ▼                      26 Model Gateway
1 Identity & Tenant Gateway       16 Run Manager                    (all three independent,
        │                                 │                          any order)
        ▼                                 ▼
48 Platform API / BFF             17 Durable Run Queue
        │                                 │
        ▼                                 ▼
52 Run Monitor  ← needs 48        18 Execution Workers
                                          │
                                          ▼
                              ┌───────────┴───────────┐
                              │  21 Executor          │  needs 18 + 20 + 22
                              └───────────────────────┘
                                          │
                              29 Verification ← needs 26
```

**Track A and Track B are fully independent** — the runtime does not need identity to be built, only to be present at run time. Start both on day one of the phase.

**21 Executor is the join point.** It cannot start until 18, 20 and 22 all land. Whoever finishes first picks it up.

> **Verification in this phase is semantic only.** The mechanical check reads back through Tool Gateway, which does not exist until Phase 4. Build the semantic path now; the mechanical path is a **Phase 4 revisit**, not a new component.

---

### Phase 3 — Design path

The moat chain serializes. Everything else fills the space around it.

```
WAVE 1   46 Workspace & Workflow Mgmt   │ Builder A
         5  ADS Store                   │ Builder C     all independent leaves
         11 Capability Registry         │ Builder C

WAVE 2   4 ADS Client        ← needs 5, 46     │ Builder C
         3 Conversation Mgr  ← needs 1, 26     │ Builder A

WAVE 3   6 Problem Understanding ← needs 3, 4  │ Builder B   ┐
                     │                                        │
WAVE 4               ▼                                        │ THE MOAT CHAIN
         7 Planner                                            │ ONE BUILDER
                     │                                        │ START TO FINISH
                     ▼                                        │
         9 Capability Resolver                                │
                     │                                        │
                     ▼                                        │
         10 Architecture Synthesizer                          ┘

         ── while Builder B runs that chain ──
         Builder A: 50 Chat & Workflow Builder  (needs 3, 48)
         Builder C: idle capacity → assists Integrator on real-execution runs

WAVE 5   12 Selection & Binding ← needs 10, 11  │ Builder C
         8  Clarification Loop                  │ Builder A

WAVE 6   14 Graph Compiler ← needs 12           │ Builder A

WAVE 7   51 Canvas ← needs 14 (must render a real DAG) │ Builder A
```

**Why 6-7-9-10 cannot be split:** these four define the boundary that *is* the moat. The Planner emitting data dependencies rather than execution edges is a single design intention held across four components. Split across agents and the boundary erodes — which is precisely how it eroded in the previous build.

> **Clarification Loop is attended-only in this phase.** Unattended delivery needs Notification (Phase 5). A question raised while a human is present works now; one raised during an unattended run is a **Phase 5 revisit**.

---

### Phase 4 — Real external effects

Widest parallelism in the whole plan. Five independent starts.

```
WAVE 1   24 Side-Effect Ledger   │ Builder B    ← MUST land before 27
         47 Connection & Cred    │ Builder A
         55 Outbox Relay         │ Builder A
         23 Provisioning         │ Builder C
         2  Event & Trigger GW   │ Builder C

WAVE 2   27 Tool Gateway   ← needs 24 + 47 + 37  │ Builder B
         49 Public Surface ← needs 2 + 37        │ Builder C
         28 Sandbox        ← needs 23 + 24 + 37  │ Builder B

WAVE 3   29 Verification — REVISIT: mechanical read-back now possible via 27
```

**The 24-before-27 rule is absolute.** No external effect may fire before the ledger that records it exists. Build them in the wrong order and every effect performed in between is invisible to the idempotency gate forever.

---

### Phase 5 — Resilience

```
WAVE 1   45 Notification  │ Builder C   ← gates 25 and 30
         40 Eval & Red-team│ Builder A
         31 Synthesis      │ Builder C

WAVE 2   30 Recovery Policy Engine ┐  Builder B — same agent, one problem
         13 Agent Factory          ┘
         25 Approval Store  ← needs 45  │ Builder A

WAVE 3   53 Approval Inbox   ← needs 25 │ Builder A
         15 Workflow Lifecycle ← needs 40 │ Builder C
         8  Clarification — REVISIT: unattended delivery now possible via 45
```

**30 and 13 go to the same builder.** Recovery calls Agent Factory during self-heal; they are one problem wearing two names. Splitting them means two agents negotiating a contract that a single agent would simply hold in mind.

**45 before everything that needs a human.** An approval nobody sees is an approval that never fired.

---

### Phase 6 — Learning

```
WAVE 1   33 Policy Store  │ Builder B   ← both others read from it

WAVE 2   32 Memory & Learning ← needs 29, 33  │ Builder A
         34 Drift Detector    ← needs 26, 27, 29, 33 │ Builder C
```

---

### Phase 7 — Completion

```
WAVE 1   44 Deletion & Retention — full erasure + saga │ Builder A
         54 Account & Admin                            │ Builder B
         (43 Billing, 41 Cache — deferred, no work)
```

Fully parallel. 44 needs every component registered, which they are by now.

---

## The seven serialization points

Memorise these. Everything else can move.

| # | Constraint | Why |
|---|---|---|
| 1 | **35 blocks all of Phase 1** | Generates the types everything imports |
| 2 | **42 → 1 → 48** | Roles must exist before permissions can resolve before requests can route |
| 3 | **19 → 16 → 17 → 18** | Runtime chain, tightly coupled state machine |
| 4 | **6 → 7 → 9 → 10** | The moat boundary — one design intention, one agent |
| 5 | **24 before 27** | No effect fires before the ledger recording it exists |
| 6 | **45 before 25 and 30** | Nothing that needs a human ships before delivery works |
| 7 | **33 before 32 and 34** | Both read learned policy |

---

## Components built twice — plan for the revisit

These are **not** rework. They are components whose full contract cannot be satisfied until a later dependency exists. Budget for the second pass.

| # | Component | First pass | Revisit |
|---|---|---|---|
| 29 | Verification | Phase 2 — semantic check only | **Phase 4** — mechanical read-back via Tool Gateway |
| 8 | Clarification Loop | Phase 3 — attended only | **Phase 5** — unattended delivery via Notification |
| 44 | Deletion & Retention | Phase 1 — registration mechanism and CI gate | **Phase 7** — full erasure and saga |
| 20 | Node Type Registry | Phase 2 — one node type | **Phases 4–5** — Tool, Gate, HumanApproval, Merge as those land |
| 10 | Architecture Synthesizer | Phase 3 — decides topology | **Phase 6** — Policy Store informs pattern preference |
| 12 | Selection & Binding | Phase 3 — scoring | **Phase 6** — learned routing weights from Policy Store |

**Mark these in the tracker at first pass**, or the second pass reads as scope creep and gets skipped — which is exactly how a component ends up permanently thinner than its contract.

---

## Utilisation, honestly

Three builders are not evenly loaded, and pretending otherwise creates confusion.

| Phase | Effective parallelism | Slack |
|---|---|---|
| 1 | 3 after 35 lands | Contract Keeper is the bottleneck early |
| 2 | 3 — three genuine tracks | Best-balanced phase |
| 3 | ~1.7 | **Moat chain serializes Builder B for most of the phase.** Builders A and C run out of dependent work in Wave 4 |
| 4 | 3 — five independent starts | Widest phase |
| 5 | 2.5 | 30+13 occupy one builder for a long stretch |
| 6 | 2 after 33 | Small phase |
| 7 | 2 | Small phase |

**Phase 3 is where a builder will be idle.** Do not fill it with new components — put that agent on real-execution verification with the Integrator. The moat chain is the highest-risk work in the project and deserves the extra pair of eyes more than a fourth parallel component does.

---

## The throughput ceiling

**The Integrator is the ceiling, not the Builders.** Three agents writing code faster than one agent can verify against real dependencies reproduces the previous build's failure exactly — volume outpacing verification, 114k lines that never ran.

**If work backs up at the Integrator, add verification capacity. Never add build capacity.** Reassign a Builder to verification before you reassign anyone to a new component.
