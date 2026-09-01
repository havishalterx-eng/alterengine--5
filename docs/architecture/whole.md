# Alter Engine — Whole Architecture

Fifth and final document in the architecture set:

1. `alter-engine-rebuild-design-log.md` — decisions and reasoning (28 sections)
2. `alter-engine-component-contracts.md` — 55 component contracts
3. `alter-engine-layer-architecture.md` — L1–L8 composition
4. `alter-engine-plane-architecture.md` — planes and the Account/Control plane
5. **this document** — the engine as one system

Started: 2026-09-01. Nothing built yet — this is design, deliberately completed before code.

---

## 1. The two paths

The engine is not one pipeline. It has two, meeting at exactly one point.

```mermaid
flowchart TD
    subgraph DESIGN[DESIGN PATH · runs once per workflow creation or edit]
      direction TB
      D1[L1 Front Door<br/>identity · intent] --> D2[L2 Context<br/>load context · define problem]
      D2 --> D3[L3 Alter Brain<br/>decide what system should exist]
      D3 --> D4[L4 Capability Fabric<br/>find · choose · author]
      D4 --> D5[L5 Graph Build<br/>compile · version · promote]
    end

    subgraph RUN[RUN PATH · runs thousands of times]
      direction TB
      R1[L1 Front Door<br/>receive · resolve tenant] --> R6[L6 Durable Runtime<br/>queue · execute · checkpoint]
      R6 --> R7[L7 Execution Gateways<br/>models · tools · sandbox]
      R7 --> R8[L8 Verify · Heal · Learn]
    end

    D5 -.->|versioned DAG,<br/>stored| R6
    R8 ==>|CROSSING POINT<br/>Recovery replan| D3

    style D3 fill:#fff4e5
    style R8 fill:#e8f5e9
```

**Design path** — a human describes an objective; Alter decides what system should exist, binds real implementations, and compiles a versioned graph. Reasoning-heavy, slow, expensive. Rare.

**Run path** — a trigger fires; an already-compiled graph executes, is verified, and repairs itself. Fast, frequent, never touches the Planner.

**The crossing point** — Recovery's `replan`, when a failure indicates the workflow's *design* is wrong rather than its execution. One edge, and the only one.

> Reading these as a single L1→L8 pipeline implies every run passes through the Planner — the equivalent of rewriting the recipe from scratch every time you cook. It also gives every component the wrong performance and blast-radius profile.

---

## 2. End-to-end trace — design time

*A user opens Alter and types: "When someone fills out my contact form, save them to my leads spreadsheet and tell my sales team on Slack."*

| Step | Component | What happens |
|---|---|---|
| 1 | **48. Platform API/BFF** | Authenticated request arrives from **50. Chat & Workflow Builder** |
| 2 | **1. Identity & Tenant Gateway** | Validates JWT, resolves tenant, derives permissions from roles via **42** |
| 3 | **3. Conversation Manager** | Classifies intent: *build a new workflow*. Tracks active goal |
| 4 | **6. Problem Understanding** | Requests context from **4. ADS Client**, which queries **5. ADS Store** scoped to this workflow |
| 5 | **6** | Assembles `ProblemSpec` — **including explicit success criteria**: a row exists in the sheet with the submitted fields; a message posts to #sales-leads naming the lead and company |
| 6 | **8. Clarification Loop** | *(if criteria or systems are unclear)* asks the user; otherwise skipped |
| 7 | **7. Planner** | Decomposes into a task skeleton: receive submission → persist → notify |
| 8 | **9. Capability Resolver** | Per node: capability tags plus model tier. Names no provider |
| 9 | **10. Architecture Synthesizer** | Decides topology — three nodes, sequential, no agent needed for persistence, no human gate. Emits `ArchitectureSpec` |
| 10 | **11. Capability Registry** | Returns candidates: Sheets connector, Slack connector, form trigger |
| 11 | **12. Selection & Binding** | Scores and pins concrete bindings across the full factor set |
| 12 | **13. Agent Factory** | *(not invoked — existing capabilities fit)* |
| 13 | **47. Connection & Credential Mgmt** | **Batch-asks** for Google and Slack connections now that the full tool list is known |
| 14 | **14. Graph Compiler** | Compiles `WorkflowDAG`, validates: no cycles, no orphans, waves intact, within size caps |
| 15 | **15. Workflow Lifecycle** | Draft → Test → Evaluation, gated by **40. Eval & Red-team** → Published |
| 16 | **49. Public Surface** | Hosts the public form at a real URL |
| 17 | **51. Canvas** | Renders the **live DAG** — never a mock — for review and editing |

**Planes touched throughout:** **35** (every typed handoff), **36** (traced), **37** (user input screened), **38** (decisions audited), **39** (model calls costed).

---

## 3. End-to-end trace — run time

*3:00am Tuesday. A stranger submits the form. Nobody is watching.*

| Step | Component | What happens |
|---|---|---|
| 1 | **49. Public Surface** | Receives anonymous submission. Screened by **37**, rate-limited |
| 2 | **2. Event & Trigger Gateway** | Validates, normalizes to canonical event, **writes durably, acknowledges immediately** — sign-and-release |
| 3 | **1. Identity & Tenant Gateway** | Resolves tenant from workflow ownership via **46**. No human actor |
| 4 | **16. Run Manager** | Resolves production version from **15**; runs **atomic pre-flight budget gate** against **39**; enqueues |
| 5 | **17. Durable Run Queue** | Entry leased. **16's scheduled sweeper** drains it — not the next launch |
| 6 | **19. Durable Substrate** | Workflow started on Temporal; state now crash-durable |
| 7 | **18. Execution Workers** | Claims the work, delegates to **21** |
| 8 | **21. Executor** | Asks **20** how to run node 1. Consults **24** — nothing fired yet |
| 9 | **27. Tool Gateway** | Writes the row to Sheets. Records **intent then confirmation** in **24**. Costed in **39**, audited in **38** |
| 10 | **29. Verification** | **Mechanical:** reads the sheet back through **27** — row present, values correct. **Semantic:** output matches this node's sub-task. Pass |
| 11 | **22. Blackboard** | Node 1 output stored; node 2 inherits it without re-prompting |
| 12 | **21** → **27** | Posts to #sales-leads. Effect recorded in **24** |
| 13 | **29. Verification** | Reads Slack back: message exists, names the right lead and company. Pass |
| 14 | **29. Verification** | **Holistic check** — combined outcome against the intake success criteria from step 5 of design time. Pass |
| 15 | **31. Synthesis** | Assembles the final result |
| 16 | **32. Memory & Learning** | Verified outcome → learning candidate with provenance and confidence |
| 17 | **33. Policy Store** | Candidate recorded, versioned, reversible |
| 18 | **39. Cost Ledger** | Cost attributed with **verification verdict recorded** — making verified-run billing possible |

**Nobody was awake. Nothing blocked. Everything was checked.**

---

## 4. End-to-end trace — failure and self-heal

*Same run, but the Slack node fails.*

```mermaid
flowchart TD
    F[Slack node fails] --> V[29. Verification<br/>verdict: FAIL]
    V --> C[30. Recovery Policy Engine]
    C --> CL{CLASSIFY}
    CL -->|transient| T[one plain retry<br/>no swap]
    CL -->|node's own fault| S[12. Selection & Binding: swap<br/>or 13. Agent Factory: create]
    CL -->|credential gap| CR[HARD STOP<br/>notify user to reconnect]
    CL -->|target missing| TR[ask user to redirect]
    CL -->|ambiguous| AM[8. Clarification Loop]
    CL -->|SAFETY| NEVER[never reaches here —<br/>halted at 29]

    T --> IG{{24. Side-Effect Ledger<br/>IDEMPOTENCY GATE}}
    S --> IG
    IG -->|Sheets row already written —<br/>do not repeat| EX[21. Executor<br/>resume at Slack node only]
    EX --> N[45. Notification<br/>tell user what was repaired]

    style IG fill:#ffe8e8
    style CL fill:#fff4e5
    style NEVER fill:#eee
```

**Three things this trace demonstrates that a single-strategy retry cannot:**
1. **Classification precedes action.** A transient blip gets a cheap retry; a broken agent gets replaced; an expired token stops and asks, because no amount of swapping fixes a credential.
2. **The idempotency gate prevents the repair from causing harm.** The Sheets row was already written. Without **24**, retrying duplicates the lead.
3. **Repair is scoped to the smallest broken layer.** Only the Slack node re-runs. The workflow is not restarted, and the design is not re-planned.

---

## 5. The moat, drawn

Design log Section 1: the differentiator is that nothing in the market decides *what system should exist*. That claim is structural, not aspirational — it is these three mechanisms.

```mermaid
flowchart LR
    subgraph M1[MOAT 1 · Autonomous system design]
      A[ProblemSpec] --> B[9. Capability Resolver] --> C[10. Architecture<br/>Synthesizer] --> D[WorkflowDAG]
    end

    subgraph M2[MOAT 2 · Multi-layer recovery]
      E[30. Recovery] --> F[provider · agent · tool ·<br/>node · branch · workflow ·<br/>problem]
    end

    subgraph M3[MOAT 3 · Controlled learning]
      G[29. Verification] --> H[32. Memory] --> I[(33. Policy Store<br/>versioned · reversible)] --> J[34. Drift]
      I -.-> C
      I -.-> E
    end

    style C fill:#fff4e5
    style I fill:#e8f5e9
```

**Moat 2 is visible as L8's back-edges** — Recovery reaching into L3 (replan, clarify), L4 (swap, rebind, create), L5 (recompile), L6 (retry), L7 (escalate model). No other layer has that reach. Most systems' entire failure handling is the single L6 edge.

**Moat 3 is a loop, and its direction matters.** Verified outcomes feed policy; policy feeds architecture and routing decisions; drift decays what goes stale. Learning updates *versioned, reversible policy*, never engine code (Rule 14) — which is exactly why design log Section 3 chose it over a neural approach it could not inspect or roll back.

---

## 6. System-wide invariants

True everywhere, in every component, on both paths.

**Identity and isolation**
- Tenant scope is established once at L1 and propagates forward with the run. Nothing re-establishes it (Rule 16).
- Permissions are derived from roles. A permission set is never empty by construction.
- Resources belong to the tenant, not the member who created them.
- Cross-tenant access is impossible at the storage layer, not merely at the guard.

**Boundaries**
- Requirements (**9**), availability (**11**), and choice (**12**) are three separate concepts (Rules 7–9).
- **The Planner emits data dependencies, never execution edges.** Architecture Synthesizer owns topology; Graph Compiler compiles it and invents nothing (Rules 5–6). If execution edges are decided upstream, the moat layer is hollow by construction regardless of implementation effort.
- Every external interaction passes a gateway (Rule 10).
- Sandbox is isolated computation only (Rule 11).
- Durability is infrastructure-backed, never hand-rolled (Rule 12).
- **No cross-database joins, no distributed transactions, no two-phase commit.** Cross-service events outside a workflow's reach go through **55. Outbox Relay**; anything inside one is already covered by the durable substrate.

**Truth**
- **Fail-closed by default.** Unverifiable means failed or needs-review — never a silent pass.
- **Absence is visible, never invisible.** A declared-but-unbuilt capability returns a real 501 with a tracking reference, renders a genuine disabled state, and is marked unimplemented in the generated inventory. Fail-closed says *never claim a success you did not verify*; this says *never let absence look like data*.
- Verification precedes learning (Rule 13).
- No external effect is performed without being recorded first.
- No re-execution occurs without consulting the idempotency gate.
- A judged output is never treated as instruction.
- Cost never silently degrades quality.

**Structure**
- Every scheduled or background capability has a named driver **and a test asserting that driver exists**.
- **The same applies to data: a store with no writer is machinery with no driver.** Every table declares what writes to it, and an unwritten store fails the same check.
- Every shared primitive has exactly one definition, and **the schema generates both sides of every call** — a client method with no server operation is unrepresentable, not merely tested against.
- Every declared capability appears in the generated inventory. A capability in code but absent from the inventory fails the build — this is what lets any sweep prove its own coverage.
- Every component holding tenant data registers with **44**, enforced in CI, and erasure runs as a saga with compensations.
- **Safety is what you get by doing nothing.** The dangerous configuration is never the default: an unset variable must never select a mock, a bypass, or a permissive mode. The previous build's mock path was the default unless a variable was explicitly set — the defect was the direction, not the existence of the branch.
- No mock is reachable from a production entry point or shipped in a bundle. Network-layer interception is permitted in development and test only, and those responses must be **recorded from real ones, never hand-authored** — a recording cannot invent a shape the server does not produce, and it goes visibly stale when the contract changes.
- In production mode, selecting any mock provider is a fatal startup error.

---

## 7. Component census

| Group | Count | Notes |
|---|---:|---|
| **Engine L1–L8** | 34 | The execution core, both paths |
| **Cross-cutting planes** | 7 | One deferred (**41. Cache**) |
| **Account/Control plane** | 7 | One deferred (**43. Billing**); includes **55. Outbox Relay** |
| **Surfaces** | 7 | Built thin-first, incrementally |
| **Total** | **55** | 53 to build, 2 deliberately deferred |

**Components, not services — and that gap must be closed before building.** Several components will share a deployable. Every contract carries a **PROCESS** field, currently unassigned.

**Assigning it is a gate before the first component is built**, because **blast radius is partly a function of co-location.** Two components in one process share a failure domain, so a declared "degraded, self only" is only true if nothing critical sits beside it. Blast radius was declared for all 55 components without the information needed to verify any of them — the field is honest about that rather than inventing a mapping. For reference, the previous build ran 30 components across 15 services.

---

## 8. What "done" means

The design is complete when every contract's done gate passes against **real execution** — never fixtures, never mocks (design log Section 6).

**Nine driver-exists tests**, each targeting the old build's most expensive failure pattern — correct machinery that nothing ever turned:

| # | Driver test |
|---|---|
| 1 | A queued run dispatches **with nothing else happening in the system** |
| 2 | A scheduled trigger fires on time, unprompted |
| 3 | ADS content becomes retrievable after ingestion |
| 4 | Registry availability updates when a provider degrades |
| 5 | A timeout-mode approval resolves with no human present |
| 6 | Run history past its retention window is deleted automatically |
| 7 | Drift evaluation runs on schedule |
| 8 | **The audit chain verifier runs and detects a tampered entry** |
| 9 | A credential expiry warning fires before expiry |
| 10 | **An outbox event is published with nothing else happening**, and survives killing the relay mid-flow |

**Four tests against the old build's most damaging defects:**
- **Canvas:** load-then-save round-trips the real DAG unchanged *(the stub that wrote)*
- **Deletion:** a tenant table added without registration fails the build *(the list that went stale)*
- **Recovery:** a transient error retries and succeeds, and is never treated as terminal *(the catch that dropped runs)*
- **Contracts:** deleting a route from the schema removes its client method rather than leaving it callable *(the 117 hand-written methods beside a committed schema)*

### The thesis gate — how anyone knows the moat works

Not a component, and not a done gate on one. This is the acceptance test for the product claim itself, and without it the claim is unfalsifiable.

- **Golden set** — 20 to 30 real business objectives, fixed before the experiment runs
- **Two arms** — a baseline using a simple heuristic to pick the strategy, and a candidate using the scored Synthesizer. Both compile and **actually run**
- **Primary metric** — task success rate as judged by **29. Verification & Quality Gate**, which already produces real verdicts
- **Guardrails** — cost per run and p95 latency, neither regressing beyond a stated bound
- **Significance** — Fisher exact test, valid at small n
- **Minimum detectable effect, stated in advance** — Fisher being exact does not make it powerful. At n≈25 only a large effect is visible at all, so an MDE must be declared up front alongside a defined **inconclusive** outcome, distinct from a negative one. Without that, "no significant difference" gets read as *the thesis failed* when it means *the experiment cannot see anything this size*
- **Operability check** — dry-run with both arms set to baseline. It must return *no significant difference*, not an error and not a pass

**And the honest one, from design log Section 1:** a live run, mid-failure, creates a new agent, binds it, and resumes. Nobody in the industry has shipped that working — including the old build, whose equivalent strategy was stubbed as *"no real target system wired yet."* If any part of this architecture proves optimistic, it is that line.

---

## 9. Open items carried into build

| Item | Source | Status |
|---|---|---|
| **Process layout — which components share a deployable** | §7 above | **Gate before the first component is built.** Blast radius is unverifiable until it is assigned |
| Credit pricing and free-tier limits | §21 | User defines; infrastructure built with values as configuration |
| Approval notification delivery channels | §16 | Push, email, in-app — settle before the approval flow is built end-to-end |
| Classify bucket refinement | §4 | Provisional by design; expect revision once real testing surfaces unimagined failures |
| Project Mode | §23 | Out of v1; Sandbox and Provisioning kept small so it remains addable, never a rearchitecture |

**One caution, worth stating before the first wiring lands.** Connecting a screen to a real endpoint changes what the user sees from a confident number to, often, an empty list — because the engine has run almost no real work yet. **Expect the product to look emptier and more broken immediately after this work, not less.** That appearance is the first honest picture, and it is the same principle as fail-closed applied to the interface.

---

*Design complete. No code written — deliberately. Next: the repository, one folder per component, each carrying its contract as its README.*
