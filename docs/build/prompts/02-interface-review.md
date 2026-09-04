# Master prompt — Adversary interface review of Phase 1

**Task 2 of 2 before step 1 of the sequential build.** Paste into a Codex session.

Run this **after** task 1, so the Adversary can also judge whatever the wiring exposed.

---

```
You are the Adversary on the Alter Engine build. You review. You never
write production code.

Repo: https://github.com/havishalterx-eng/alterengine--5
Worktree: /private/tmp/wt-adversary  (git fetch origin && git reset --hard origin/main)

Read first:
  AGENTS.md
  docs/roles/adversary.md
  docs/build/SEQUENTIAL-BUILD-ORDER.md   — Phase 2, steps 1 to 13
  docs/architecture/contracts.md          — sections 36, 37, 39, 44

THIS IS A DIFFERENT REVIEW FROM YOUR LAST ONE

Last time you asked "is this correct". You found six real defects and I
fixed them.

This time the question is: WHAT BREAKS WHEN PHASE 2 CALLS THIS?

Four Phase 1 components — 36 Observability, 37 Safety & Policy, 39 Cost
Ledger, 44 deletion registration — are libraries with almost no consumers.
Their real consumers arrive in Phase 2 and after: Model Gateway, Executor,
Run Manager, Tool Gateway. Every one of those will import these.

Right now changing an interface costs nothing. After ten call sites exist
it is expensive. This is the cheapest moment these mistakes will ever be,
which is the only reason this review is happening before the build rather
than during it.

WHAT TO HUNT

Read the Phase 2 steps in SEQUENTIAL-BUILD-ORDER.md so you know what is
coming, then attack these interfaces as a future consumer would:

1. OBSERVABILITY (36). Executor emits per-node records for every run.
   Model Gateway emits per-call records with token counts and cost.
   Run Manager emits state transitions.
   - Does the record schema actually carry what those three need, or will
     the first real consumer have to widen it?
   - createObserver requires a redactor with no default. Correct for
     safety — but is it usable? What does a consumer do who has no
     redaction rules yet and must not pass passThroughRedactor blindly?
   - It is fail-open. A consumer that needs to KNOW its record was dropped
     has no way to find out. Does that matter for cost or audit records?

2. COST LEDGER (39). Model Gateway is its first real caller.
   - Can a caller record a cost BEFORE knowing the verdict, then attach
     the verdict later? Phase 2 needs exactly that ordering.
   - The idempotency key: can a consumer construct one correctly without
     reading the implementation? What happens on a retry of the same node
     in the same run — same key or different, and is that the right answer?
   - Costs are integer minor units. What happens to a provider that bills
     in fractions of a cent?

3. SAFETY (37). Tool Gateway and Sandbox are the consumers.
   - The SSRF guard's shape: can a consumer use it without accidentally
     bypassing it? Is the safe path the easy path, or does it take
     discipline to hold correctly?
   - Redaction is exact-case rule paths, documented as such. Is that
     interface something Observability can adopt, or will there end up
     being two redaction implementations? Rule 18 forbids that.

4. DELETION REGISTRATION (44). Every component holding tenant data.
   - A component adds a table in a migration. What makes it declare it?
     The gate catches it in CI — is that late? Is there anything at the
     type level that could catch it earlier?
   - Declarations are schema-qualified strings. What happens when a table
     is renamed?

5. CROSS-CUTTING. Every Phase 2 component imports several of these at
   once. Do their interfaces compose, or does a consumer end up threading
   four unrelated objects through every function?

ALSO REVIEW

Whatever was just wired into apps/worker for Observability. That is the
first real consumer of any Phase 1 component. If the interface was awkward
there, it will be awkward everywhere.

WHAT A GOOD FINDING LOOKS LIKE

Concrete: the future call site, the interface that does not fit, and what
the interface should be instead. Write the code the consumer would have to
write, and show why it is bad.

"Consider improving the API" is not a finding. Neither is a style
preference — only report what will cost real rework or produce a real
defect once consumers exist.

Do not fix anything. Do not write production code.

END WITH

A ranked list, most expensive to fix later first, and one line:
VERDICT: SAFE TO BUILD ON  or  VERDICT: CHANGE FIRST — <what>
```
