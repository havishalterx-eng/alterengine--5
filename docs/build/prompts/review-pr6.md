# Master prompt — Adversary review of PR #6

**Fix B: findings 1 and 2 from the interface review.** Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #6: https://github.com/havishalterx-eng/alterengine--5/pull/6
Branch fix/safety-and-cost, against main. Not merged.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout -B review/pr6 origin/fix/safety-and-cost
  pnpm install && pnpm build

Do not trust the PR description or the builder's report. Run it yourself.
PR #5 needed four rounds before the underlying mechanism was actually
sound — treat this one with the same suspicion from the start.

CONTEXT

Finding 1: the SSRF guard's only entry point took a URL and hardcoded
GET. Model Gateway must POST with an Authorization header, so the real
consumer would bypass the guard entirely. A security control the easy
path routes around is not a control.

Finding 2: Cost Ledger's record() fixed verificationVerdict to null and
ignored insert conflicts, so a verdict could never be attached after the
fact — Phase 2 needs exactly that ordering (record cost, attach verdict
later).

THE BUILDER'S CLAIMS

  - guarded request API: method, headers, body, timeoutMs,
    maxResponseBytes, abort signal. DNS pinning and per-hop revalidation
    untouched.
  - credentials (authorization, proxy-authorization, cookie) stripped on
    any CROSS-ORIGIN redirect
  - 1 MiB response cap per hop; maxResponseBytes only lowerable, never
    raised; Infinity/0/negative rejected before the socket opens
  - 303 and 301/302 rewrite to GET; 307/308 keep method and body;
    credentials still stripped cross-origin regardless of status code
  - live proof: a two-server redirect test where the first server sees
    a real Authorization header and the second does not
  - attachVerdict() distinct from record(); a verdict on a missing cost
    throws CostNotFoundError, no row silently created; the SAME verdict
    replayed is idempotent; a DIFFERENT verdict on an already-verdicted
    cost throws VerdictConflictError, described as terminal
  - idempotency key now derived INSIDE record() from full event identity
    — the caller cannot invent one
  - pricing: MINOR_UNIT_SCALE = 10^6, single rounding point, half-up at
    the 6th decimal, string+BigInt throughout
  - a driver-existence gate finding on a new setTimeout, resolved by
    tagging it @driver requestPinned with the justification that it arms
    and clears within one caller-driven request rather than running as a
    background loop
  - build, 140 tests (verify this count — the report says "140/17" which
    reads as file count truncated), 11 gates, lint all clean

VERIFY EACH CLAIM DIRECTLY

1. Reproduce the redirect credential-stripping test yourself, not by
   reading the builder's transcript. Then go further: a SAME-ORIGIN
   redirect (should credentials survive there, or does the guard
   over-strip?), a redirect chain of three hops where only the middle
   hop changes origin, and a redirect to the SAME origin that then
   redirects again to a DIFFERENT one two hops later.

2. Try to make maxResponseBytes exceed the 1 MiB ceiling through every
   path you can think of — a caller-supplied config object, a default
   merge, a subclass. Confirm "only lowerable" actually holds structurally
   and is not just enforced by one check that can be routed around.

3. Cost Ledger ordering: reproduce record-then-attach against real
   Postgres yourself. Then try to attach a verdict TWICE with the SAME
   value and confirm it is genuinely idempotent, not merely not-erroring
   while quietly doing something else. Try concurrent attachVerdict calls
   with different verdicts on the same cost — does VerdictConflictError
   actually surface to both callers, or does one silently win a race?

4. The idempotency key: try to construct two different record() calls
   that a caller might reasonably believe represent the same event but
   that produce different keys, or two calls a caller believes are
   different that collide. If the key is derived from "full event
   identity," what exactly is in that identity, and is it complete?

5. THE @driver JUDGEMENT CALL. The driver-existence gate flagged a
   setTimeout and the builder resolved it by tagging the timer
   @driver requestPinned with the justification that it is request-scoped,
   not a background loop. Judge this on its merits — is a per-request
   timer that arms and clears within one call actually the kind of thing
   this gate exists to catch, or is this tag technically satisfying the
   gate's pattern-match while not addressing what the gate is FOR? If a
   future request-scoped timer gets the same treatment reflexively, does
   the gate's meaning erode? State your judgement plainly, not just
   whether the code compiles.

6. Pricing: half-up rounding at the 6th decimal, string+BigInt
   throughout. Find a case where this loses money in a systematic
   direction — half-up rounding on many small transactions, does it bias
   totals up or down over volume? Is that intentional?

7. Confirm the SSRF protections that already worked keep working: DNS
   rebinding between validation and connect, a redirect to a private
   address, IPv4-mapped IPv6, the cloud metadata endpoints including
   Alibaba's 100.64.0.0/10 range from your first review.

8. Anything not on this list.

Run pnpm build, pnpm test, pnpm gates (stack up, DATABASE_URL set),
pnpm lint yourself. Paste real output, not the builder's claimed counts.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
