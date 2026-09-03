# Build checklist

**49 steps. One component at a time.** Tick a box only when the physical test passes — something run or clicked, not a test report.

Full reasoning per step: [`SEQUENTIAL-BUILD-ORDER.md`](SEQUENTIAL-BUILD-ORDER.md). Method: [`METHOD.md`](METHOD.md).

**Progress: 6 of 55 components merged. 0 of 49 steps done.**

---

## Done before this checklist — Phase 0 and Phase 1

- [x] Phase 0 — monorepo, three processes, Docker stack, CI, ten architecture gates, lint, config module
- [x] 35 · Type/Schema Contracts — PARTIAL
- [x] 36 · Observability — PARTIAL
- [x] 37 · Safety & Policy — PARTIAL
- [x] 38 · Audit — PARTIAL
- [x] 39 · Cost Ledger — PARTIAL
- [x] 44 · Deletion registration interface — PARTIAL

---

## Phase 2 — Walking skeleton

Hand-write a DAG and run it. The design path comes later, on purpose.

- [ ] **1** · 42 Identity & Membership — create an account and member, query the role back · *terminal*
- [ ] **2** · 1 Identity & Tenant Gateway — a member resolves to a non-empty permission set; another tenant's member gets nothing · *terminal*
- [ ] **3** · 48 Platform API + **console shell** — log in, see your account, see a genuine 501 disabled state on an unbuilt capability
- [ ] **4** · 19 Durable Substrate — start a workflow, watch it complete in the Temporal UI on `:8240`
- [ ] **5** · 16 Run Manager — Runs page lists real runs, states change as they run
- [ ] **6** · 17 Durable Run Queue — queue a run with nothing else happening; kill the database mid-dispatch, entry survives
- [ ] **7** · 18 Execution Workers — three runs sit with the worker stopped, drain when it starts
- [ ] **8** · 20 Node Type Registry — one node type listed, and it is real
- [ ] **9** · 21 Executor — paste a one-node DAG, run it, see the output
- [ ] **10** · 22 Blackboard — two-node DAG, second reads what the first wrote
- [ ] **11** · 26 Model Gateway — real model call, real response, token counts and cost
- [ ] **12** · 29 Verification *(semantic)* — good output verified; nonsense marked failed, not passed
- [ ] **13** · 52 Run Monitor — watch a run advance live; matches Temporal's own history

**Phase 2 closes:** hand-written DAG runs node by node against real Temporal, verification is honest, cost carries its verdict.

---

## Phase 3 — The design path, and the moat

- [ ] **14** · 46 Workspace & Workflow Management — save a workflow, reopen it later
- [ ] **15** · 5 ADS Store — agent library page, honestly empty
- [ ] **16** · 4 ADS Client — add an agent definition, use it in a run
- [ ] **17** · 11 Capability Registry — inventory page showing what exists and what does not
- [ ] **18** · 3 Conversation Manager — chat box, reply, reload, history intact
- [ ] **19** · 6 Problem Understanding — describe a problem, see the structured spec, correct it
- [ ] **20** · 7 Planner — inspect the raw payload yourself: no execution edge, no node type, no entry point
- [ ] **21** · 9 Capability Resolver — requirements show needed capabilities, no vendor named yet
- [ ] **22** · 10 **Architecture Synthesizer** — same requirements, two profiles, **two genuinely different graphs**
- [ ] **23** · 12 Selection & Binding — each node shows its bound provider and why it won
- [ ] **24** · 14 Graph Compiler — a workflow you described in English runs end to end
- [ ] **25** · 8 Clarification Loop *(attended)* — vague objective gets a real question, not a confident guess
- [ ] **26** · 50 Chat & Workflow Builder — build a workflow entirely by talking
- [ ] **27** · 51 Canvas — drag a node, save, reload, round-trips unchanged

**Phase 3 closes:** you describe an objective and Alter designs a topology you never specified.

> **Step 22 is the decision point of the project.** Two identical graphs means the boundary is fake. Stop there rather than build on it.

---

## Phase 4 — Real external effects

- [ ] **28** · 47 Connection & Credential — connect a real account by OAuth, get an expiry warning before expiry
- [ ] **29** · 24 Side-Effect Ledger — effects log page, empty and honest · **must precede step 30**
- [ ] **30** · 27 Tool Gateway — send a real email or write a real sheet; intent recorded before, confirmation after
- [ ] **31** · 28 Sandbox — run code; try to reach the network and watch it fail
- [ ] **32** · 2 Event & Trigger Gateway — schedule it, close the browser, come back and find it ran
- [ ] **33** · 23 Provisioning — a workflow needing a resource gets one, and you can see it
- [ ] **34** · 55 Outbox Relay — kill the relay mid-flight, restart, event still arrives exactly once
- [ ] **35** · 49 Public Surface — external webhook starts a run; flood it, authenticated use stays responsive
- [ ] **R1** · 29 revisit — mechanical read-back through Tool Gateway, not semantic judgement
- [ ] **R2** · 37 revisit — PII screened on real egress paths; shared limits on every consumer

**Phase 4 closes:** a workflow you designed by talking takes a real action, on a schedule, with verification reading the result back independently.

---

## Phase 5 — Resilience

- [ ] **36** · 45 Notification — receive a real email or push · **must precede steps 37 and 39**
- [ ] **37** · 25 Approval Store — a workflow pauses and waits for you
- [ ] **38** · 53 Approval Inbox — approve and it continues; reject and it stops
- [ ] **39** · 30 Recovery Policy Engine — break it five ways, each classified and repaired at the right level; transient errors retry and succeed
- [ ] **40** · 13 Agent Factory — **the hardest test**: break a live run, watch Alter create an agent mid-run, bind it, resume, notify you after
- [ ] **41** · 31 Synthesis — multi-branch workflow gives one coherent result
- [ ] **42** · 15 Workflow Lifecycle — edit live, promote, roll back
- [ ] **43** · 40 Eval & Red-team — the suite catches a deliberately planted weakness
- [ ] **R3** · 8 revisit — unattended clarification, now that notification exists
- [ ] **R4** · 20 revisit — Tool, Gate, HumanApproval and Merge node types

---

## Phase 6 — Learning

- [ ] **44** · 33 Policy Store — current version and its history · **must precede 45 and 46**
- [ ] **45** · 32 Memory & Learning — selection improves across repeated runs; a failed run produces **no** candidate
- [ ] **46** · 34 Drift Detector — degrade a provider deliberately and get told
- [ ] **R5** · 10 revisit — Policy Store informs topology patterns
- [ ] **R6** · 12 revisit — learned routing weights

---

## Phase 7 — Completion

- [ ] **47** · 44 Deletion & Retention *(full)* — delete an account, data genuinely gone; fail a service mid-erasure and watch the saga compensate and report incomplete
- [ ] **48** · 54 Account & Admin — manage the organisation from the console
- [ ] **49** · 35 revisit — generated server; `curl` an unbuilt route and get a real HTTP 501 with a tracking reference

### Deferred by decision
- [ ] 43 · Billing & Subscription — pricing undecided
- [ ] 41 · Cache / Reuse — needs usage volume to tune against

---

## Ordering constraints that bind regardless

| Constraint | Why |
|---|---|
| 42 → 1 → 48 | Roles exist before permissions resolve before requests route |
| 19 → 16 → 17 → 18 | One tightly coupled state machine |
| 24 before 27 | No effect fires before the ledger recording it exists |
| 45 before 25 and 30 | An approval nobody sees never fired |
| 33 before 32 and 34 | Both read learned policy |
| 6 → 7 → 9 → 10 | The moat boundary — one mental model, one sequence |

## What a tick means

A step is ticked when the physical test passes against **real** dependencies — real Postgres, real Redis, real Temporal, real providers. Not fixtures, not mocks, not a green test suite alone.

A component stays **PARTIAL** until every revisit against it is ticked. Only then is it **REAL**. A PARTIAL component may not be cited as a finished dependency.
