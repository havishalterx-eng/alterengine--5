# Sequential build order

**One component at a time. Built whole, closed, then the next.** Designed 2026-09-03 for the method in [`METHOD.md`](METHOD.md), replacing the wave-based order in [`build-order.md`](build-order.md).

49 steps remain. Every step names what gets built and **what you can physically do to see it working** — not a test report, something you run or click.

## The one design decision this required

The architecture has no "console shell". User-facing work lives in components 50–53, all of which arrive in Phase 3 or later. Under the old plan you could not touch anything until then.

So the shell arrives at **step 3, with component 48**, and every component after it contributes a view. The shell is not a new component — it is the surface 48 already owes, built early enough to be useful. Components 50–53 remain themselves; they are the *real* interfaces, and they replace their placeholder panels when they land.

Where a component genuinely has no visible surface, the physical test is a command you run and output you read. Those are marked **terminal**.

---

# Phase 2 — Walking skeleton

**The thinnest path that runs end to end.** The design path is skipped on purpose: you hand-write a `WorkflowDAG` and feed it to the runtime. Prove the spine before building the thing that generates it.

### 1 · Component 42 — Identity & Membership
Accounts, users, memberships, roles. Nothing works without it.
**Physically:** create an account and a member from the terminal, then query the member back and see the role attached. **Terminal.**

### 2 · Component 1 — Identity & Tenant Gateway
Resolves a request to a tenant and a permission set. Every later component trusts this and never re-establishes identity.
**Physically:** ask for a member's permissions and get a non-empty set; ask as a member of a different tenant and get nothing. **Terminal.**

### 3 · Component 48 — Platform API / BFF · **plus the console shell**
The HTTP surface, and the first thing you can look at. Every registry operation gets a real mounted route, and unimplemented ones return a real 501 with a tracking reference.
**Physically:** open the console in a browser, log in, and see your account. Visit an unbuilt capability and see a genuine disabled state citing its reference — not a blank screen, not a fake number.

### 4 · Component 19 — Durable Substrate
Temporal wired for real. No custom retry logic, no hand-rolled state machine.
**Physically:** start a trivial workflow from the console; watch it appear and complete in the Temporal UI on `localhost:8240`.

### 5 · Component 16 — Run Manager
Owns run lifecycle and state transitions.
**Physically:** a Runs page listing real runs with real states. Start one, watch the state change.

### 6 · Component 17 — Durable Run Queue
Queued work with leasing. **This is where the previous build failed worst** — its queue was correct and nothing ever drove it.
**Physically:** queue a run while nothing else is happening and watch it get picked up. Then kill the database mid-dispatch and confirm the entry is still there afterwards.

### 7 · Component 18 — Execution Workers
The thing that drives the queue. Step 6 is inert without this, and that pairing is the point.
**Physically:** stop the worker, queue three runs, see them sit. Start the worker, watch all three drain.

### 8 · Component 20 — Node Type Registry — one node type only
Exactly one type: an LLM call. Resist adding more.
**Physically:** the console lists available node types. One entry, and it is real.

### 9 · Component 21 — Executor
Runs a single node and returns its output.
**Physically:** paste a hand-written one-node DAG into the console, run it, see the output.

### 10 · Component 22 — Blackboard
Shared run state that nodes read and write.
**Physically:** run a two-node DAG where the second reads what the first wrote. See both values on the run page.

### 11 · Component 26 — Model Gateway
Real provider calls behind one boundary. Nothing else imports a vendor SDK.
**Physically:** run a node that actually calls a model and see the real response, with token counts and cost.

### 12 · Component 29 — Verification & Quality Gate *(semantic half only)*
Judges whether a node's output actually satisfied its intent.
**Physically:** run a node that succeeds and see it verified; run one that returns nonsense and watch it marked failed rather than passed.

### 13 · Component 52 — Run Monitor
Live run view, streaming real events.
**Physically:** start a multi-node run and watch it advance step by step, then compare against Temporal's own history and confirm they match.

**Phase 2 is closed when:** you type an objective's DAG by hand, press run, watch it execute node by node against real Temporal, see verification pass or fail honestly, and see the cost with its verdict attached.

---

# Phase 3 — The design path, and the thesis

**The moat.** Everything before this was infrastructure any competent team could build. This is the part nothing on the market does.

### 14 · Component 46 — Workspace & Workflow Management
Workspaces, saved workflows, versions.
**Physically:** create a workspace, save the hand-written DAG from Phase 2, reopen it later.

### 15 · Component 5 — ADS Store
Where agent definitions live.
**Physically:** list the agent library in the console. Empty at first, and honestly empty.

### 16 · Component 4 — ADS Client
Reads and writes agent definitions.
**Physically:** add an agent definition, see it in the library, use it in a run.

### 17 · Component 11 — Capability Registry
What implementations exist — separate from what a task requires, and separate from choosing between them. Collapsing those three is the most likely architectural error in the engine.
**Physically:** a capability inventory page showing what exists and what does not.

### 18 · Component 3 — Conversation Manager
Holds the conversation that becomes a workflow.
**Physically:** a chat box. Type, get a reply, reload the page, see the history intact.

### 19 · Component 6 — Problem Understanding
Turns what you said into a stated problem.
**Physically:** describe a business problem in the chat, see the structured `ProblemSpec` it produced, and correct it.

### 20 · Component 7 — Planner
Emits **data dependencies only** — never execution edges, node types, or an entry point.
**Physically:** see the requirements it produced. The console shows the raw payload; confirm for yourself there is no edge and no node type in it.

### 21 · Component 9 — Capability Resolver
States what each requirement needs, without choosing an implementation.
**Physically:** each requirement shows its needed capabilities; none of them names a vendor yet.

### 22 · Component 10 — **Architecture Synthesizer** — the moat
Decides what topology should exist. **The single most important component in the project.**
**Physically:** run the same requirements twice, once cost-constrained and once latency-constrained, and see **two genuinely different graphs** side by side. If they come back the same, the boundary is fake and everything upstream is theatre — stop and fix it before building further.

### 23 · Component 12 — Selection & Binding
Picks concrete implementations for the chosen topology.
**Physically:** each node shows which provider was bound and why it won.

### 24 · Component 14 — Graph Compiler
Compiles the spec into a runnable DAG. Invents nothing.
**Physically:** a designed workflow runs end to end — the first time a thing you described in English executes.

### 25 · Component 8 — Clarification Loop *(attended only)*
Asks when the objective is underspecified.
**Physically:** describe something deliberately vague and get asked a real question instead of a confident guess.

### 26 · Component 50 — Chat & Workflow Builder
The real conversational interface, replacing the placeholder chat.
**Physically:** build a workflow entirely by talking to it.

### 27 · Component 51 — Canvas
Visual graph, editable.
**Physically:** see the workflow as a graph, drag a node, save, reload, confirm it round-trips unchanged.

**Phase 3 is closed when:** you describe an objective in English, watch Alter design a topology you did not specify, run it, and get a verified result — **and** the two-profile test produces genuinely different graphs.

> **This is the decision point of the whole project.** If the two-profile test fails, the moat does not exist yet. Stop there.

---

# Phase 4 — Real external effects

**Until now nothing has touched the outside world.**

### 28 · Component 47 — Connection & Credential Management
OAuth and credentials, encrypted.
**Physically:** connect a real account through OAuth and see it listed, with an expiry warning before it expires.

### 29 · Component 24 — Side-Effect Ledger
**Must land before Tool Gateway.** No external effect fires before the ledger that records it exists — a hard ordering constraint, not a preference.
**Physically:** an effects log page, empty and honest.

### 30 · Component 27 — Tool Gateway
Real external actions. All outbound traffic passes the SSRF guard built in Phase 1.
**Physically:** run a workflow that sends a real email or writes to a real sheet. Watch the intent recorded *before* it fires and the confirmation after.

### 31 · Component 28 — Sandbox
Isolated code execution. No browser, no database, no business APIs — those belong to Tool Gateway, and the blast radii differ.
**Physically:** run a node that executes code. Try to make it reach the network and watch it fail.

### 32 · Component 2 — Event & Trigger Gateway
Workflows that start on their own.
**Physically:** schedule a workflow, close the browser, come back and find it ran without you.

### 33 · Component 23 — Provisioning
Resources a workflow needs, created on demand.
**Physically:** a workflow that needs a resource gets one, and you can see it.

### 34 · Component 55 — Outbox Relay
Cross-service delivery outside a workflow's reach.
**Physically:** trigger an event, kill the relay mid-flight, restart it, confirm the event still arrives exactly once.

### 35 · Component 49 — Public Surface
Public endpoints — webhooks and forms.
**Physically:** hit a public webhook from outside and watch it start a run. Then flood it and confirm your authenticated session stays responsive.

**Phase 4 is closed when:** a workflow you designed by talking takes a real action in a real system, on a schedule, with the intent recorded before it happened and **verification reading the result back independently**.

### Revisit here
**Component 29** — mechanical verification: reading the effect back through Tool Gateway rather than judging it semantically.
**Component 37** — PII screening on the real egress paths, and shared limits enforced across every consumer.

---

# Phase 5 — Resilience

**Now that things break in real ways, build what fixes them.**

### 36 · Component 45 — Notification
**Lands before approvals and recovery.** An approval nobody sees is an approval that never fired.
**Physically:** receive a real email or push from the engine.

### 37 · Component 25 — Approval Store
Pending human decisions.
**Physically:** a workflow pauses and waits for you.

### 38 · Component 53 — Approval Inbox
Where you answer.
**Physically:** approve from the inbox and watch the paused run continue. Reject one and watch it stop.

### 39 · Component 30 — Recovery Policy Engine
Classifies failures into five buckets and repairs the smallest broken layer.
**Physically:** break a workflow five different ways and watch each get classified correctly and repaired at the right level. A transient error must retry and succeed — never be treated as terminal.

### 40 · Component 13 — Agent Factory
Creates new agents when none of the existing ones fit. Built with 30 because Recovery calls it — one problem, not two.
**Physically:** **the hardest test in the project.** Break a live run in a way no existing agent can handle. Watch Alter create a new agent mid-run, bind it, resume, and notify you afterwards.

### 41 · Component 31 — Synthesis
Combines node outputs into a final answer.
**Physically:** a multi-branch workflow produces one coherent result instead of a pile of fragments.

### 42 · Component 15 — Workflow Lifecycle
Versioning, promotion, retirement.
**Physically:** edit a live workflow, promote the new version, roll it back.

### 43 · Component 40 — Eval & Red-team
Adversarial suites that genuinely execute and can genuinely fail.
**Physically:** run the red-team suite and watch it catch a deliberately planted weakness.

### Revisit here
**Component 8** — the unattended clarification path, now that notification exists.
**Component 20** — the remaining node types: Tool, Gate, HumanApproval, Merge.

---

# Phase 6 — Learning

### 44 · Component 33 — Policy Store
Versioned learned policy. **Before 32 and 34** — both read it.
**Physically:** see the current policy version and its history.

### 45 · Component 32 — Memory & Learning
Alter gets better over time. **Learning updates versioned policy, never engine code.**
**Physically:** run the same objective repeatedly and watch selection improve. A failed run must produce **no** learning candidate.

### 46 · Component 34 — Drift Detector
Notices when behaviour degrades.
**Physically:** degrade a provider deliberately and get told about it.

### Revisit here
**Component 10** — Policy Store informs topology patterns.
**Component 12** — learned routing weights.

---

# Phase 7 — Completion

### 47 · Component 44 — Deletion & Retention *(full erasure and saga)*
The other half of what shipped in Phase 1.
**Physically:** delete an account and verify the data is genuinely gone everywhere. Fail one service mid-erasure and watch the saga compensate and report incomplete rather than claiming success.

### 48 · Component 54 — Account & Admin
Org settings, roles, audit view.
**Physically:** manage your organisation from the console.

### 49 · Component 35 revisit — the generated server
The Phase 2 revisit finally lands: a generated server owns route mounting, the build fails unless every implemented operation has a handler, and an unimplemented capability returns a real 501 **over HTTP**.
**Physically:** `curl` an unbuilt route and get a real 501 with a tracking reference.

### Deferred by decision
**Component 43 — Billing.** Pricing undecided.
**Component 41 — Cache / Reuse.** Needs usage volume to tune against.

---

## Standing constraints

These bind regardless of what order looks convenient later:

| Constraint | Why |
|---|---|
| 42 → 1 → 48 | Roles exist before permissions resolve before requests route |
| 19 → 16 → 17 → 18 | One tightly coupled state machine |
| 24 before 27 | No effect fires before the ledger recording it exists |
| 45 before 25 and 30 | An approval nobody sees never fired |
| 33 before 32 and 34 | Both read learned policy |
| 6 → 7 → 9 → 10 | The moat boundary. One mental model, one sequence |

## Marking

A component is **PARTIAL** until every revisit listed against it has landed. Only then is it **REAL**. A PARTIAL component may not be cited as a finished dependency, and an unticked revisit blocks its phase gate.
