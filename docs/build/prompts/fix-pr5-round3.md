# Master prompt — Fix PR #5, round 3: replace the validator, don't patch it again

**Third REJECT on the same defect class.** Paste into the builder session.

---

```
You are the Builder on the Alter Engine. PR #5 was rejected a third time.
Read that as a signal about the approach, not just the four new findings.

  cd /private/tmp/wt-builder-b
  git fetch origin
  git checkout fix/observability-shape
  git pull

WHY THIS TIME IS DIFFERENT

Round 1 found a Map slipping past Object.values. You fixed that specific
case. Round 2 found Symbol keys, sparse arrays, extra array properties,
and a throwing getter — four MORE ways past the same Object.values /
.every() approach. Each round has been a correct fix for the exact case
demonstrated, and each round has left another case standing, because
Object.values() and .every() were never going to be exhaustive. They
were built to iterate normal data, not to certify that nothing abnormal
is present.

Do not patch these four findings individually. Replace the validator with
one that is correct by construction, not by accumulated test case.

THE FOUR FINDINGS, FOR CONTEXT ONLY — do not fix them one at a time

  1. Symbol keys are invisible to Object.values and silently dropped.
  2. Array.prototype.every skips holes: new Array(1) passes as if empty,
     then serializes to [null]. It also does not see extra non-index
     properties like arr.hidden = 'lost', which are silently dropped.
  3. Object.values() and Array iteration both INVOKE getters. A getter
     that throws crashes emit() for a caller who never asked to run
     arbitrary code by logging.
  4. Two test files still throw a teardown TypeError when DATABASE_URL is
     unset, because their afterAll unconditionally closes a connection
     that setup never created. The worker tests already have the correct
     pattern — a readiness flag guarding teardown. Apply it here too.

THE FIX

One recursive function, `isJsonSafe`, that never assumes a shape is safe
because a method returned something. Walk every value using
Reflect.ownKeys and Object.getOwnPropertyDescriptor, and NEVER touch
`.value` on a descriptor until you have confirmed it is a plain data
property:

  For any value, in order:
    - primitives (string, finite number, boolean, null): safe
    - undefined, bigint, symbol, function: unsafe
    - anything else that is not typeof 'object': unsafe
    - already visited (cycle): unsafe
    - arrays: Array.isArray must be true. Reflect.ownKeys(value) must
      equal exactly the array indices 0..length-1 plus 'length' — no
      extra properties, no symbol keys, no holes (a hole is an index NOT
      present in Reflect.ownKeys even though it is within length). Every
      index's descriptor must be a plain data property, enumerable,
      no get/set. Recurse into descriptor.value, never into a live read.
    - plain objects: prototype must be Object.prototype or null.
      Reflect.ownKeys(value) must contain no symbols. Every own key's
      descriptor must be a plain data property, enumerable, no get/set.
      Recurse into descriptor.value.
    - anything else: unsafe

The rule that matters most: NEVER READ A PROPERTY UNTIL YOU HAVE CHECKED
ITS DESCRIPTOR IS A PLAIN DATA PROPERTY. That is what closes the getter
finding, and it is also what makes the Symbol and sparse-array findings
fall out for free — you are no longer relying on a method that happens
to skip the cases you have not thought of.

Prove it is exhaustive, not case-by-case. Write ONE property-based or
table-driven test that runs a long list of unsafe shapes through the
function and asserts every one is rejected:
  Map, Set, WeakMap, class instance, class instance with toJSON(),
  Symbol key, sparse array, array with extra property, array with a
  getter, object with a throwing getter, object with a non-enumerable
  property, a Proxy wrapping a plain object, bigint nested three levels
  deep, a frozen object containing a Map.
Include ones the Adversary has not tried. Finding new cases yourself is
the actual proof the approach is now exhaustive rather than reactive.

THE TEARDOWN FIX

Find the readiness-flag pattern already used in the worker tests. Apply
the same pattern to audit-store.test.ts and verifier.test.ts: afterAll
must check the flag before calling close(), so an unconfigured run fails
once, clearly, at loadConfig — not with a confusing TypeError from
teardown on top of it.

THE COST ROUND-TRIP TEST

The Adversary correctly noted your round-trip test proves BigInt(string)
round-trips, not that the observability emit/store path preserves
precision end to end. Leave it as documentation of the ENCODING decision,
but the comment must not imply it proves the pipeline. State plainly:
this proves the string format is reversible; it does not exercise
emit() or the sink.

CONSTRAINTS

- Do not weaken anything that already passed twice: the compile-time
  bigint check, system-record identity rejection, the single Redactor
  definition.
- Do not add `any` or a cast anywhere in the new validator.
- If you find a FIFTH case while building the exhaustive test that the
  new function does not catch, fix the function, not the test.

WHEN DONE

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim. Commit, push to fix/observability-shape.

REPORT

Confirm you replaced the validator rather than patched it, and paste the
full list of unsafe shapes your exhaustive test covers. If you patched
individual cases instead of replacing the approach, say so plainly rather
than let a fourth review find the sixth hole.
```
