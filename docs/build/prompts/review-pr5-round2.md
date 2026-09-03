# Master prompt — Adversary re-review of PR #5

**Second pass, after REJECT.** Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #5 was REJECTED on your last pass, for two findings. The builder
reports both fixed. Re-verify from scratch — do not assume anything you
approved last time still holds; a fix for one finding can break another.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout fix/observability-shape
  git pull
  pnpm install && pnpm build

THE BUILDER'S CLAIMS

Finding 1 (Map/Set/class instances silently emptied): fixed with an
isPlainObject() check — prototype must be Object.prototype or null.
Applied recursively into nested objects and arrays.

Finding 2 (false BigInt() claim): comment corrected to say no consumer
exists yet. Builder also ADDED a round-trip test (encode 17n, parse the
string back with BigInt(), assert equal) to make the claim true rather
than just honest about the gap.

A THIRD THING, NOT ASKED FOR: the builder made a design decision on Date.
JSON.stringify serializes a Date predictably as an ISO string, but
JsonObject has no Date at the type level, so the runtime guard now
REJECTS a Date rather than allowing it through. The producer is expected
to encode dates as strings itself.

VERIFY

1. Your exact Map repro from last time. Confirm REJECTED, not silently
   emptied. Then go further than the builder's own tests: a Map nested
   two levels deep, a class instance with a toJSON() method (does that
   change anything?), a plain object with a Symbol key, an object with a
   getter that throws.

2. The recursive check: does it actually recurse into every position a
   payload can hold a nested value, or only the ones the builder happened
   to test? Check arrays of arrays, objects nested in arrays nested in
   objects.

3. The BigInt round-trip test — is it a REAL round trip through the same
   code path the worker actually uses to emit and store a record, or a
   standalone unit test of BigInt() and JSON.stringify that does not
   prove the observability path itself preserves precision?

4. The Date decision. Do you agree with rejecting it rather than coercing
   it to an ISO string automatically? Rejecting is more conservative but
   pushes work onto every future producer. Say which you think is right
   and why, since this was not something I asked the builder to decide.

5. Confirm nothing that passed last time now fails: the bigint compile
   check, the system-record identity rejection (runId/nodeId/tenantId
   attempted every way), the single Redactor definition, the clean
   loadConfig failure on unset DATABASE_URL.

6. Run everything yourself: pnpm build, pnpm test, pnpm gates (stack up,
   DATABASE_URL set), pnpm lint. Paste the real output, not the builder's
   claimed counts.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
