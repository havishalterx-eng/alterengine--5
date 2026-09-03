# Master prompt — wire Observability into the worker

**Task 1 of 2 before step 1 of the sequential build.** Paste into a builder session.

Kept unambiguous rather than maximally compressed: this is a multi-step instruction where a misread costs more than the words saved.

---

```
You are building on the Alter Engine. Repo: https://github.com/havishalterx-eng/alterengine--5

Read first, in this order:
  1. AGENTS.md
  2. docs/build/METHOD.md
  3. docs/architecture/contracts.md  — section 36 only
  4. packages/observability/src/     — all of it
  5. apps/worker/src/index.ts and apps/worker/src/drivers/

State before writing code: what you read, and what you understood the task to be.

THE PROBLEM

Component 36 (Observability) is merged, tested, and called by nothing
outside its own tests. It is a library with no consumer.

That is the exact shape that killed the previous build: correct components
nobody exercised. Here it is expected — Observability's consumers arrive in
Phase 2 — but "expected" is not "proven", and an interface nobody has used
is an interface nobody has tested the shape of.

The worker already has a real consumer sitting there unused. It schedules
the audit verifier and the retention sweeper every 60 seconds. Those ticks
should be observable and currently emit nothing.

THE TASK

Wire Observability into apps/worker so the scheduled ticks emit real
records. Specifically:

1. The worker boot creates ONE observer at startup and passes it to the
   schedulers. Do not create observers ad hoc inside tick handlers.

2. createObserver requires a redactor — there is no default, deliberately.
   Pass passThroughRedactor explicitly and leave a comment saying why it is
   safe here: these records carry no tenant payload, only run metadata.
   If that turns out to be untrue for any field you emit, use a real
   redaction rule instead and say so in your report.

3. Each audit verifier tick emits a record when it starts and when it
   finishes, carrying the outcome (valid or the issues found) and how long
   it took.

4. Each retention sweeper tick does the same.

5. A tick that THROWS still emits a record saying so. A failure that
   produces no observability record is worse than no record at all,
   because it looks like the tick never ran.

CONSTRAINTS

- Do not change anything in packages/observability. If its interface does
  not fit this use, STOP and report what does not fit. That is a finding
  worth more than a workaround, and this task exists partly to discover it.
- Observability is fail-open: if emitting a record fails, the tick must
  still do its job. Verify this by breaking the sink deliberately.
- Do not read process.env. Configuration comes from loadConfig() in
  @alter/contracts. A gate enforces this.
- Do not weaken types, add `any`, or silence a gate.
- If you get stuck in a retry loop, STOP and report rather than burning
  turns.

DEFINITION OF DONE

Run all four and report the output verbatim:
  pnpm build
  pnpm test
  pnpm gates      (needs DATABASE_URL set and the stack up: pnpm stack:up)
  pnpm lint

Then prove it physically, not by assertion:
  - Start the worker. Show the observability records actually emitted by a
    real tick. Paste them.
  - Break the sink on purpose. Show that the tick still completed and the
    failure was logged loudly.

REPORT

Say what you wired, paste the real emitted records, and state plainly
anything about the Observability interface that was awkward to use. That
last part is the point of the exercise — the next ten components will
import this, and now is the cheapest moment to find out its shape is wrong.

Do not commit or push. Report first.
```
