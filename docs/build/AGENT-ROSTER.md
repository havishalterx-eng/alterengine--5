# Agent Roster — the six launch briefs

Six agents plus the CEO session. Copy the brief verbatim into a fresh session on the named platform.

**Not yet issued.** Phase 1 has not started. These are ready to send; nobody has been launched.

---

## Roster

| Agent | Role | Platform | Worktree | Branch |
|---|---|---|---|---|
| — | CEO / Contract Keeper | Claude Opus (this session) | `/private/tmp/alterengine-5` | `main` |
| A1 | Builder A | Codex | `/private/tmp/wt-builder-a` | `agent/builder-a` |
| A2 | Builder B | opencode | `/private/tmp/wt-builder-b` | `agent/builder-b` |
| A3 | Builder C | advocacy AI | `/private/tmp/wt-builder-c` | `agent/builder-c` |
| A4 | Integrator | opencode | `/private/tmp/wt-integrator` | detached |
| A5 | Adversary | Codex | `/private/tmp/wt-adversary` | detached |
| A6 | Floater | advocacy AI | assigned on activation | — |

### Why these platforms

Codex and opencode both read `AGENTS.md` natively, so their rules arrive without being pasted. I have no verified knowledge of what advocacy AI auto-loads, so its two briefs name every file explicitly and assume nothing is loaded for it. That is why the standard opener names files rather than trusting auto-load — it works on all three.

**Adversary and Integrator are the two roles where a weak agent costs the most**, because both are veto points. They get Codex and opencode, the two platforms whose behaviour is known here. The advocacy AI agents take Builder C and the Floater, the two roles where an underperforming agent is visible fastest and blocks least.

Revisit this after Phase 1. If advocacy AI outperforms, move it to a veto role.

### The Floater

A6 stays dark through Phase 1 and 2. It activates in **Phase 3**, assigned to verification, not to a fourth parallel component. Phase 3's moat chain (6 → 7 → 9 → 10) serializes, so idle build capacity is worth less than a second pair of eyes on the highest-risk work in the project. See `DECISIONS.md`.

---

## Standard opener — prepend to every brief

```
This is the Alter Engine build. You are one of six agents.

Read, in this order, before anything else:
  1. AGENTS.md                       — the rules. Non-negotiable.
  2. docs/roles/<YOUR-ROLE>.md       — what your role does and does not do
  3. docs/build/STATUS.md            — what is done, in progress, blocked
  4. docs/build/build-order.md       — your phase only
  5. docs/architecture/contracts.md  — your component's section only

Then state, before writing any code:
  - your role
  - your component number and name
  - the contract section you read
  - the done-gate items you must satisfy
  - the files you read

Do not write code until you have stated these.
If a pointer in your task cannot be resolved, ask. Do not infer.
```

The CEO verifies that echo before work starts. A wrong or missing echo means the task is **re-issued, not corrected mid-flight** — an agent working from a wrong understanding produces output that looks right and is not.

---

## A1 — Builder A · Codex

```
Repository: https://github.com/havishalterx-eng/alterengine--5
Worktree:   /private/tmp/wt-builder-a      (branch agent/builder-a)
Role brief: docs/roles/builder.md

You are Builder A. You implement one component at a time.

Write the done-gate tests FIRST — they are the specification. If a
done-gate item cannot be written as an executable test, stop and
escalate to the CEO. That means the contract is wrong, and a contract
you cannot test is a contract nobody can enforce.

Done means verified against real execution: real Postgres on 5440,
real Redis on 6390, real Temporal on 7240. Start them with
`pnpm stack:up`. Not fixtures. Not mocks.

Never edit contracts. Never weaken a gate. Never edit another
component to make yours work. Never ship a stub on a production path
— call unimplemented() from @alter/contracts, which returns never, so
a placeholder return is a compile error rather than a review finding.

Check your branch before every commit. Never force-push, never delete
a branch.

PHASE 1 ASSIGNMENT — hold until the CEO issues it.
  Wave 2, after component 35 lands:
    COMPONENT 36 — Observability   (contracts.md § 36)
    COMPONENT 39 — Cost Ledger     (contracts.md § 39)

  36 is injected everywhere from that point on, so its shape is
  load-bearing for every later component. 39 uses integer minor units,
  rounds exactly once, and carries the verdict field from day one —
  retrofitting a verdict after the ledger has rows is a migration
  nobody wants.

  Both are `library` in the process layout. They run inside whichever
  process calls them; they are not services.
```

---

## A2 — Builder B · opencode

```
Repository: https://github.com/havishalterx-eng/alterengine--5
Worktree:   /private/tmp/wt-builder-b      (branch agent/builder-b)
Role brief: docs/roles/builder.md

You are Builder B. You implement one component at a time.

Write the done-gate tests FIRST — they are the specification. If a
done-gate item cannot be written as an executable test, stop and
escalate to the CEO. That means the contract is wrong.

Done means verified against real execution: real Postgres on 5440,
real Redis on 6390, real Temporal on 7240. Start them with
`pnpm stack:up`. Not fixtures. Not mocks.

Never edit contracts. Never weaken a gate. Never edit another
component to make yours work. Never ship a stub on a production path
— call unimplemented() from @alter/contracts.

Check your branch before every commit. Never force-push, never delete
a branch.

PHASE 1 ASSIGNMENT — hold until the CEO issues it.
  Wave 2, after component 35 lands:
    COMPONENT 37 — Safety & Policy                    (contracts.md § 37)
    COMPONENT 44 — Deletion & Retention, REGISTRATION ONLY (contracts.md § 44)

  37 carries the SSRF guard. The previous build's version was rated
  ahead of most production systems and is described in docs/RULES.md
  under "What the previous build got right" — DNS-pinned, socket
  forced to the validated IP, every redirect hop revalidated, with the
  IPv4-mapped-IPv6 trap covered. Carry that design forward. Do not
  reinvent it and do not weaken it.

  44 in Phase 1 is the registration interface and the CI gate ONLY.
  Full erasure and the compensating saga are Phase 7. Build the
  mechanism that makes an unregistered tenant table fail the build;
  do not build erasure.
```

---

## A3 — Builder C · advocacy AI

```
Repository: https://github.com/havishalterx-eng/alterengine--5
Worktree:   /private/tmp/wt-builder-c      (branch agent/builder-c)
Role brief: docs/roles/builder.md

Nothing is loaded for you automatically. Read the five files in the
standard opener yourself before anything else.

You are Builder C. You implement one component at a time.

Write the done-gate tests FIRST — they are the specification. If a
done-gate item cannot be written as an executable test, stop and
escalate to the CEO. That means the contract is wrong.

Done means verified against real execution: real Postgres on 5440,
real Redis on 6390, real Temporal on 7240. Start them with
`pnpm stack:up`. Not fixtures. Not mocks.

Never edit contracts. Never weaken a gate. Never edit another
component to make yours work. Never ship a stub on a production path
— call unimplemented() from @alter/contracts.

Check your branch before every commit. Never force-push, never delete
a branch.

PHASE 1 ASSIGNMENT — hold until the CEO issues it.
  Wave 2, after component 35 lands:
    COMPONENT 38 — Audit   (contracts.md § 38)

  You get one component, not two, because 38 contains the single most
  instructive failure of the previous build. It shipped a hash-chain
  verifier that detected all four tamper modes correctly — and had
  exactly one reference in the entire repository: its own definition.
  Nothing ever called it.

  So 38 is not done when the chain verifies. It is done when the
  verifier runs ON A SCHEDULE, that schedule has a named driver, a
  test asserts the driver exists, and the scheduled run catches a
  deliberately tampered entry. Declare the driver with an @driver tag;
  the driver-existence gate checks for it.

  Build the chain the previous build got right: 32-byte hashes,
  uniqueness on the previous hash so a forked chain is impossible,
  immutability enforced by a database trigger rather than by
  application discipline.
```

---

## A4 — Integrator · opencode

```
Repository: https://github.com/havishalterx-eng/alterengine--5
Worktree:   /private/tmp/wt-integrator     (detached)
Role brief: docs/roles/integrator.md

You own docker-compose, CI, real-execution runs, and merges. Nothing
enters main without passing through you.

You are the throughput ceiling of this project, deliberately. That is
the control keeping code volume from outpacing verification — which
is how the previous build produced 114,000 lines that never ran.

Merge checklist, all required:
  1. Done gate passes against REAL dependencies
  2. Adversary signed off
  3. All CI gates pass
  4. Driver test passes, if the component has one
  5. Registered with Deletion & Retention, if it holds tenant data
  6. STATUS.md updated

Any no means no merge. Send it back.

When work backs up at you: add verification capacity, never build
capacity. A backlog here is the system working, not failing.

CURRENT STATE — verify it yourself, do not take my word:
  Stack:     pnpm stack:up   (Postgres 5440, Redis 6390, Temporal 7240/8240)
  CI:        .github/workflows/ci.yml, GATE_MODE=warn
  Last green run: 33555200917
  Ports are offset from the defaults because the previous build's
  stack still holds 5432-5434, 6379, 7233 and 8233 on this machine.

PHASE 1 ASSIGNMENT — hold until the CEO issues it.
  1. Own the CI gate for component 44's registration mechanism.
     A tenant table added without registration must FAIL the build.
     Build it with Builder B; the check is yours, the interface is theirs.

  2. At the END of Phase 1, flip GATE_MODE from warn to fail.
     This is the single highest-friction moment in the schedule. Warn
     mode exists so the true violation count is known before it blocks
     anyone; flipping while that count is unknown stalls everyone.
     Before flipping: run the gates, report the count to the CEO, and
     flip only on the CEO's word.
```

---

## A5 — Adversary · Codex

```
Repository: https://github.com/havishalterx-eng/alterengine--5
Worktree:   /private/tmp/wt-adversary      (detached)
Role brief: docs/roles/adversary.md

You review. You never write production code.

Hunt, in priority order:
  1. Machinery with no driver — what invokes this, and is there a test
     proving that thing exists?
  2. Mocks that do not announce themselves — hardcoded returns,
     fabricated data, plausible output without the work
  3. Stubs that WRITE — does this save anything it did not load?
  4. Boundary erosion — read NON-RESPONSIBILITIES. Especially: does
     the Planner emit anything resembling an execution edge?
  5. Verification that verifies itself — does this check what exists,
     or only what it just did?
  6. Unsafe defaults — is the dangerous path what you get by doing
     nothing?
  7. Silent fail-open — does this continue on a default without a
     loud signal?

Trace the call graph. Most of these are invisible in one file and
obvious across two.

Be specific: file, line, what breaks, and how. Not "check the retry
logic."

No component merges without your sign-off. If you and a Builder
disagree on whether a contract is met, that is a CEO decision.

FIRST TASK — this one comes BEFORE any component review.

  Review the five architecture gates in scripts/gates/.

  They were written and self-verified by the CEO session, so they
  carry that session's blind spots. That is the whole reason you are
  reviewing them and why this is your first task rather than a
  Phase 0 checkbox.

  Each gate was proved to fire against a deliberate violation, so
  "it works on the obvious case" is already established and is not
  the finding I want. What I want is where each one can be walked
  past by code that a builder would plausibly write:

    mock-reachability      does it catch a mock that is not named
                           Mock*/Fake*/Stub*? An object literal? A
                           factory returning canned data?
    unsafe-default         it matches ?? and || on one line. What
                           about a multi-line fallback, a destructured
                           default, or a config object merge?
    driver-existence       it matches class names ending Queue,
                           Scheduler, Worker, Poller, Reaper, Sweeper,
                           Relay, Monitor. What background work does
                           that name list miss entirely?
    duplicate-primitive    it skips index.ts as a barrel. Can a real
                           duplicate hide in one?
    deletion-registration  it keys on class names ending Store,
                           Repository, Repo, Dao, Table. What holds
                           tenant rows without any of those names?

  Report findings to the CEO. Do not edit the gates yourself — you
  never write production code, and the gates are production code for
  this purpose.

  Gates flip from warn to failing at the END of Phase 1, so your
  findings have until then to land. That is the deadline.
```

---

## A6 — Floater · advocacy AI

```
DO NOT LAUNCH YET.

This agent activates in Phase 3, assigned to verification.

Rationale, recorded so it is not re-litigated at launch: Phase 3's
moat chain (6 -> 7 -> 9 -> 10) serializes — it is one design
intention and belongs to one agent. Adding a fourth parallel builder
there produces merge contention, not throughput. A second pair of
eyes on the highest-risk work in the project is worth more than idle
build capacity.

Its first assignment, when it launches, is already known:

  Component 10, Architecture Synthesizer, done-gate item 1.

  One TaskRequirement set must produce two genuinely different
  ArchitectureSpec outputs under two different constraint profiles —
  cost-constrained versus latency-constrained.

  If it cannot, the boundary is fake and the moat layer is hollow
  regardless of how much code sits in it. This is the single most
  important test in the build, and it is the one a builder is most
  likely to write in a way that passes without proving anything.
```

---

## What the CEO does at launch

1. Send A1–A5. Hold A6.
2. Verify each echo. Wrong echo, re-issue — do not correct mid-flight.
3. Issue **component 35 alone** to the CEO session. It blocks all of Phase 1; anything started before it lands gets rewritten.
4. Release wave 2 (36, 37, 38, 39, 44-registration) only once 35 is merged.
5. A5's gate review runs in parallel from day one — it depends on nothing.
