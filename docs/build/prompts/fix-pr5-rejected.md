# Master prompt — Fix PR #5's rejected findings

**Adversary rejected PR #5.** Two findings, both real. Paste into the same builder session that built PR #5, or a fresh one on the same branch.

---

```
You are the Builder on the Alter Engine. PR #5 was reviewed and REJECTED.
Two findings, both confirmed real by the Adversary running the code
directly. Fix both before re-requesting review.

  cd /private/tmp/wt-builder-b
  git fetch origin
  git checkout fix/observability-shape
  git pull

WHAT WAS CONFIRMED WORKING — do not touch these

  - bigint payload: real compile error, proven by removing @ts-expect-error
    and watching the build fail
  - system record with runId/nodeId/tenantId: rejected at runtime in every
    form tried — literal, spread, variable
  - circular payload: rejected, no hang
  - one Redactor definition, Observability re-exports Safety's

FINDING 1 — THE RUNTIME GUARD HAS THE SAME HOLE THE COMPILE-TIME FIX WAS
SUPPOSED TO CLOSE.

The type system now rejects a bigint payload at compile time. But the
RUNTIME validator in schema.ts checks JSON-safety using Object.values,
which does not distinguish a plain object from a Map, a Set, or a class
instance. The Adversary proved it:

    payload: { cost: new Map([['minorUnits', '17']]) }

This is ACCEPTED by the validator. It then reaches JSON.stringify in the
worker sink and silently becomes:

    "payload":{"cost":{}}

The data is gone and nothing reports it. This is finding 3 from the
original review, reopened through a path the fix did not cover — anyone
who builds a payload dynamically (not as a literal, so the compile-time
check does not see it) can still lose data silently.

Fix: the runtime validator must reject anything that is not a plain
object or array. A plain object has Object.getPrototypeOf equal to
Object.prototype or null — not a Map, not a Set, not a class instance,
not anything with a custom prototype. Reject those explicitly rather than
assuming Object.values covers the case.

Prove it with the Adversary's own repro: emit a payload containing a Map,
and show it is now REJECTED, not silently emptied.

FINDING 2 — A CLAIM IN A COMMENT THAT IS NOT TRUE.

schema.ts says cost telemetry is a decimal string "parsed back with
BigInt()". The Adversary grepped for that consumer and it does not exist.
ledger.ts's BigInt() usage parses an unrelated SQL aggregate, not an
observability payload.

There is currently no code anywhere that reads an observability cost
record and reconstructs the bigint. That may be correct — Model Gateway,
the real consumer, does not exist until Phase 2 — but the comment claims
a working path that is not there, which is worse than saying nothing.

Fix: change the comment to state the actual situation. Say what the
encoding is and why (decimal string, because JSON has no bigint and a
number loses precision past 2^53), and say plainly that no consumer
parses it back yet — that arrives with Model Gateway in Phase 2. Do not
claim a mechanism that does not exist.

If you believe a round-trip proof belongs in THIS package regardless of
whether a real consumer exists yet, you may add one: encode a bigint,
parse the string back with BigInt(), assert equality. That would make the
comment true rather than aspirational. Your call — but the comment must
match whichever you choose.

CONSTRAINTS

- Do not weaken the compile-time check that already works.
- Do not add `any` or a cast to route around the plain-object check.
- If fixing the runtime guard reveals another type of value that should
  be allowed and currently is not (e.g. Date, which JSON.stringify does
  handle predictably), say so rather than silently deciding either way.

WHEN DONE

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim. Then commit, push to fix/observability-shape.

REPORT

For finding 1: the Adversary's exact Map repro, run against your fix, with
the output showing rejection. Not a description of the fix — the actual
before/after behaviour.

For finding 2: what the comment now says, and whether you added a
round-trip test or left the honest "no consumer yet" statement.
```
