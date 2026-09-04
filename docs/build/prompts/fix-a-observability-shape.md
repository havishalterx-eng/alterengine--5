# Master prompt — Fix A: observability record shape and the redaction seam

**Adversary findings 3, 4 and 5.** Paste into a builder session. Run before Fix B.

Branch: `fix/observability-shape`, cut from `origin/wire/observability` — PR #4 is not merged, and this builds on it.

---

```
You are the Builder on the Alter Engine. Repo:
https://github.com/havishalterx-eng/alterengine--5

Read first:
  1. AGENTS.md
  2. docs/build/METHOD.md
  3. docs/architecture/contracts.md   — sections 36 and 37
  4. packages/observability/src/      — all of it
  5. apps/worker/src/index.ts and apps/worker/src/drivers/

WORKTREE

  cd /private/tmp/wt-builder-b
  git fetch origin
  git checkout -B fix/observability-shape origin/wire/observability
  pnpm install

Your database is alter_builder_b. Configuration through loadConfig() from
@alter/contracts — never process.env directly, never the .env file.

WHY THIS EXISTS

An Adversary interface review asked "what breaks when Phase 2 calls this"
and found three problems. All three are in code the CEO wrote, and all
three get more expensive every step from here.

FINDING 3 — SILENT TELEMETRY LOSS. This is the serious one.

Observer.emit accepts `unknown`. The schema accepts arbitrary payload
values. The worker sink calls JSON.stringify, which THROWS on a bigint.
The observer catches that, drops the record, and the run looks fine.

Cost is stored as bigint. So the first time Model Gateway emits a cost
record, telemetry silently disappears:

    observer.emit({ payload: { costMinorUnits: 17n }, ... });

It compiles. It validates. It vanishes.

Fix:
  - emit must accept a TYPED, JSON-SAFE record, not `unknown`. A value
    that cannot survive serialisation must not typecheck.
  - The payload type must exclude bigint, undefined, functions, symbols
    and circular structures at the type level.
  - Cost must have an explicit encoding decision. Say what it is in a
    comment: a string, or a number of minor units, and why.
  - Prove it: write the bigint case and show it is now a COMPILE error,
    not a runtime drop. A test asserting the old behaviour is not proof.

FINDING 4 — SYSTEM RECORDS FABRICATE A RUN.

audit-verifier-scheduler.ts and audit-retention-sweeper.ts emit
`runId: 'system:worker'`. That is not a run. Run Monitor at step 13 will
list it as one.

The scope discriminator added in PR #4 fixed tenant ambiguity and left
run ambiguity alone. Half a fix.

Make it structural, the same way scope was:
  - A system record carries process or driver identity, not run identity.
    It must not be able to name a runId or nodeId at all.
  - A tenant record requires real run identity.
  - Prove it: a system record naming a runId must fail to typecheck or be
    rejected by the schema. Show it.

FINDING 5 — TWO REDACTION TYPES, ONE POLICY.

Observability's redactor takes Record<string, unknown>. Safety's takes
JsonValue. A consumer wiring the real redactor has to cast:

    redactor: (payload) => redact(payload as JsonObject, rules)

A cast at a policy boundary is where redaction quietly stops happening.
Rule 18 forbids two definitions of one shared primitive, and this is two.

Fix: one shared JSON type, owned by Safety, used by both. Safety exports
a rules-backed Redactor that Observability accepts directly, with no cast
at the call site.

ALSO

The Adversary saw afterAll errors reading `close` of undefined when
config was absent. Tests should fail with a clear configuration message,
not a confusing TypeError in teardown.

CONSTRAINTS

- Do not weaken types, add `any`, or cast to silence something. A cast is
  the defect in finding 5; do not fix it with another one.
- emit() returns no delivery outcome and that is correct — observability
  is best-effort. Do NOT add a return value that a caller could mistake
  for a guarantee. Cost Ledger and Audit remain the authoritative writes.
- Do not touch packages/safety beyond the shared JSON type and the
  exported Redactor. Fix B covers the rest of Safety.
- If the contract is wrong rather than the code, STOP and report.

WHEN DONE

Run all four, paste output verbatim:
  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Then commit, push to fix/observability-shape, open a PR against
wire/observability. Do NOT merge.

REPORT

What you changed per finding, and the PROOF for findings 3 and 4 — the
bigint case failing to compile, and a system record with a runId being
rejected. Show the actual error text.

A report that says "fixed" without that output tells me nothing.
```
