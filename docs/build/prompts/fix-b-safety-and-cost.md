# Master prompt — Fix B: guarded HTTP requests and the cost verdict lifecycle

**Adversary findings 1 and 2.** Paste into a builder session. Run after Fix A is merged.

Branch: `fix/safety-and-cost`, cut from `origin/main` once Fix A has landed.

---

```
You are the Builder on the Alter Engine. Repo:
https://github.com/havishalterx-eng/alterengine--5

Read first:
  1. AGENTS.md
  2. docs/build/METHOD.md
  3. docs/architecture/contracts.md   — sections 37 and 39
  4. docs/RULES.md                    — "What the previous build got right"
  5. packages/safety/src/ssrf.internal.ts
  6. packages/cost-ledger/src/ledger.ts

WORKTREE

  cd /private/tmp/wt-builder-c
  git fetch origin
  git checkout -B fix/safety-and-cost origin/main
  pnpm install

Your database is alter_builder_c. Configuration through loadConfig() from
@alter/contracts — never process.env directly, never the .env file.

WHY THIS EXISTS

An Adversary interface review asked "what breaks when Phase 2 calls this".
Both components are merged, tested, and have no real consumer yet. Both
have interfaces their first consumer cannot actually use.

FINDING 1 — THE SSRF GUARD'S SAFE PATH IS UNUSABLE.

The guard accepts a URL and hardcodes GET. Model Gateway needs to POST
with an Authorization header and a JSON body:

    await fetch(modelUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: JSON.stringify(request),
    });

There is no way to do that THROUGH the guard. So the first real consumer
bypasses it — and a security control that the easy path routes around is
not a control.

This is the most consequential finding in the set. The guard itself is
good: DNS-pinned, socket forced to the validated IP, every redirect hop
revalidated. None of that helps if nobody can use it.

Fix: a guarded request API taking method, headers, body, and a timeout or
abort signal. All of it still passes DNS pinning and per-hop revalidation.

TWO THINGS THE GUARD MUST OWN, NOT THE CALLER:

  - Redirect header policy. Credentials must NEVER be forwarded to a
    redirect host. An Authorization header for api.openai.com must not
    follow a 302 to somewhere else. The caller cannot be trusted to
    remember this, so the guard enforces it.
  - Response size limits, enforced by default. An unbounded fetcher must
    not be constructible.

Prove both. Stand up a local server that redirects to a different host and
show the Authorization header is not present on the second request. Show
an oversized response being cut off rather than buffered.

Do not weaken any existing protection. If you think you have found an
improvement to the DNS pinning or revalidation, STOP and report it before
writing it.

FINDING 2 — THE COST LEDGER CANNOT RECORD A VERDICT.

record() fixes verificationVerdict to null, and the insert ignores
conflicts. So a verdict can never be attached:

    await ledger.record({ ...cost, verificationVerdict: null });
    await ledger.record({ ...cost, verificationVerdict: 'passed' }); // ignored

Phase 2 needs exactly the ordering that is impossible: Model Gateway
records a cost when the call completes, and Verification attaches a
verdict later. Contract 43 says billing consumes credits only for runs
that pass verification, and that is only claimable if the verdict is
actually recorded against the cost.

Fix:
  - A verdict-update operation, distinct from record(). Attaching a
    verdict to a cost that does not exist must fail loudly, not silently
    create one.
  - A canonical idempotency-key builder. Today the key is an opaque
    string and every consumer invents its own. Two consumers inventing
    differently is a double charge. The key belongs to this component.
  - Decide and document scaled-integer pricing. Callers currently receive
    already-rounded minor units and must guess the scale. Rounding
    happens exactly once, and this component decides where.

Prove the ordering with real Postgres: record a cost with no verdict,
attach 'passed' later, read it back. Then attach a verdict to a
nonexistent cost and show it fails.

CONSTRAINTS

- Do not weaken types, add `any`, or silence a gate.
- No float anywhere in the cost path. There is a gate for this.
- Do not change component 36 — Fix A covers observability.
- If the contract is wrong rather than the code, STOP and report.

WHEN DONE

Run all four, paste output verbatim:
  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Then commit, push to fix/safety-and-cost, open a PR. Do NOT merge.

REPORT

Per finding: what changed, and the proof. For finding 1 that means the
actual redirect test output showing the header absent. For finding 2, the
real read-back after a late verdict attach.

Claims without that output will be sent back.
```
