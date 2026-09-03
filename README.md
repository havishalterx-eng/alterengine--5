# Alter Engine

Takes a business problem, decides what system should exist to solve it, builds and runs that system durably, verifies the real-world outcome, repairs failures at the smallest broken layer, and learns safely — without a human hand-designing the workflow.

**Status: Phase 1 closed.** Six components merged, all PARTIAL. Ten architecture gates failing rather than warning. 92 tests against real Postgres, Redis and Temporal.

---

## Agents start here

**Read [`AGENTS.md`](AGENTS.md) before doing anything.** It is the canonical rules file for every agent on this project, regardless of tool.

Then your role brief in [`docs/roles/`](docs/roles/), then [`docs/build/STATUS.md`](docs/build/STATUS.md).

---

## Where things are

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The ten rules. Always read first |
| [`docs/RULES.md`](docs/RULES.md) | Full rule set with reasoning |
| [`docs/roles/`](docs/roles/) | CEO · Builder · Integrator · Adversary |
| [`docs/build/STATUS.md`](docs/build/STATUS.md) | **Single source of truth for progress** |
| [`docs/build/DECISIONS.md`](docs/build/DECISIONS.md) | Append-only decision log |
| `docs/build/build-order.md` | Superseded wave-based order. Kept for its dependency reasoning |
| [`docs/build/METHOD.md`](docs/build/METHOD.md) | **How this build runs.** Read before anything else |
| [`docs/build/CHECKLIST.md`](docs/build/CHECKLIST.md) | **The live checklist.** Tick a box only when the physical test passes |
| [`docs/build/SEQUENTIAL-BUILD-ORDER.md`](docs/build/SEQUENTIAL-BUILD-ORDER.md) | The 49 steps with full reasoning per step |
| `docs/build/AGENT-ROSTER.md`, `SESSION-SETUP.md`, `LAUNCH-BRIEFS.md` | Superseded. Kept as the record of how Phase 1 was produced |
| [`docs/architecture/contracts.md`](docs/architecture/contracts.md) | All 55 component contracts |
| [`docs/architecture/whole.md`](docs/architecture/whole.md) | The engine as one system |
| [`docs/architecture/layers.md`](docs/architecture/layers.md) | L1–L8 composition |
| [`docs/architecture/planes.md`](docs/architecture/planes.md) | Cross-cutting and account planes |
| [`docs/architecture/design-log.md`](docs/architecture/design-log.md) | Every decision and its reasoning |
| [`docs/architecture/map.html`](docs/architecture/map.html) | Interactive visual map — open in a browser |

---

## The shape

**Two paths, not one pipeline.** The design path (L1→L5) runs once per workflow creation — a human describes an objective, Alter designs and compiles a graph. The run path (L1→L6→L7→L8) runs thousands of times and never touches the Planner. They meet at exactly one point: Recovery's `replan`.

**55 components** — 34 engine across eight layers, 7 cross-cutting planes, 7 account/control, 7 surfaces. Two deferred by decision.

**TypeScript.** One engine deployable plus an isolated Sandbox. Temporal external.

**The differentiator:** nothing in the market — n8n, LangChain, LangGraph — decides what topology should exist for an arbitrary problem. Every one of them requires a human to draw the graph first.

---

## The standard

The previous build produced 114,000 lines of source and 93,000 lines of tests and **never ran end to end.** Its architecture was sound; its own audit said so. It failed because correct-looking components accumulated faster than anyone verified them.

**A component that compiles, passes its tests, and has never run against a real dependency is not built.**
