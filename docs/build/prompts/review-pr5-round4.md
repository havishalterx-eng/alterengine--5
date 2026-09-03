# Master prompt — Adversary review of PR #5, round 4

**After the architectural replacement.** Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #5 was rejected three times. The builder was told, on round 3, to stop
patching individual cases and replace the validator entirely — walk every
value via Reflect.ownKeys and Object.getOwnPropertyDescriptor, never
reading a property until its descriptor is confirmed a plain enumerable
data property.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout fix/observability-shape
  git pull
  pnpm install && pnpm build

Re-verify from scratch. Do not assume anything from rounds 1-3 still
holds — this round replaced the mechanism those findings were against.

THE BUILDER'S CLAIMS

  - Object.values()/.every() walk deleted entirely, replaced with a
    descriptor-based walker
  - a post-descriptor live-read compare specifically to catch a Proxy
    whose get-trap lies about what a descriptor says
  - found a fifth hole unprompted: a throwing getter crashed INSIDE
    zod's record parser before refinement ever ran, so emit() itself
    needed its own guard, not just the validator
  - a 32-case exhaustive table, with the last six (bigint nested three
    deep, frozen object containing Map, Date, RegExp, Promise, boxed
    String, Uint8Array, NaN, Infinity, undefined value, function value,
    circular object, circular array, Map nested in object, Set nested in
    array — the builder's report runs together which six are "found by
    me"; identify them precisely) not drawn from any prior review
  - stated caveat: a trap-free Proxy over a plain object is ACCEPTED,
    because it is genuinely indistinguishable from its target and
    ECMAScript designs it that way — only DIVERGENT proxies are rejected
  - teardown fix verified by moving .env aside: one ConfigurationError,
    zero TypeErrors
  - round-trip comment corrected to disclaim pipeline coverage
  - build, 107 tests, 11 gates, lint all clean

VERIFY, DO NOT ASSUME

1. Run the 32-case table yourself if it exists as a file — do not accept
   "all rejected" as a claim. If any of the 32 pass, that is the finding.

2. The trap-free-proxy caveat: try to break it precisely where the
   builder says it is safe. A Proxy with only a `has` trap that lies. A
   Proxy wrapping a plain object where the target is later mutated after
   the proxy was validated but before the sink serializes it (a TOCTOU
   gap — time of check to time of use). Does the validator re-check at
   serialization or trust its earlier verdict?

3. The zod-parse-crashes-before-refinement claim. Confirm it independently
   — construct the exact throwing-getter input, call emit() with the
   validator in place, and trace whether the crash happens where the
   builder says it does. Then confirm the guard actually catches it at
   the call site the builder claims, not somewhere that happens to also
   work.

4. Try something not on the list of 32. You have found things twice
   before that were not asked for. Do it again — this validator has now
   survived one deliberate attempt at exhaustiveness, which is exactly
   the point where a subtle gap is most likely to still be hiding.
   Consider: getter defined via Object.defineProperty AFTER the object
   passed validation but before serialization; an array-like object
   (has length and indices but is not Array.isArray); Reflect.ownKeys
   returning keys in an order that differs from enumeration order; a
   value that changes its own descriptor between the check and the read
   (a getter that redefines the property as a side effect).

5. Re-run the teardown fix yourself — do not trust the builder's report
   of moving .env aside. Do it, run the full suite, confirm one clear
   ConfigurationError and no TypeError.

6. Confirm everything from rounds 1-3 that passed still passes: bigint
   compile check, system-record identity rejection every way, single
   Redactor definition.

7. pnpm build, pnpm test, pnpm gates (stack up, DATABASE_URL set),
   pnpm lint — paste real output.

If this is genuinely clean, say so plainly. Three REJECTs in a row does
not mean you owe a fourth — a real architectural fix can actually close
every case. Judge what is in front of you, not the streak.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
