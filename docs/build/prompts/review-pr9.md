# Master prompt — Adversary review of PR #9

**Component 1, Identity & Tenant Gateway.** Whole-engine blast radius, real JWT cryptography. Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #9: https://github.com/havishalterx-eng/alterengine--5/pull/9
Branch component/1-identity-tenant-gateway, against main. Not merged.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout -B review/pr9 origin/component/1-identity-tenant-gateway
  pnpm install && pnpm build

Do not trust the PR description or the builder's report. Run it yourself.
This is one of very few components rated whole-engine blast radius on
purpose — if it is wrong, nothing downstream is actually protected, no
matter how correct everything else in the build is.

THE BUILDER'S CLAIMS

  - typed ActorContext gateway, RS256 JWT/JWKS validation, fail-closed
  - unknown-kid protection bounded (negative cache + rate limit)
  - rotated keys stop validating: the key map is REPLACED, never merged
  - cross-tenant denial
  - RLS proof against a real non-superuser role for the gateway's own
    connection
  - trigger-originated path explicitly unimplemented() with a tracking
    reference, deferred to step 32 — not faked
  - "component 42's resolvePermissions worked with its own RLS
    transaction context, no interface gap" — meaning the gateway did
    NOT need to reach into component 42's pool, which was the whole
    point of fixing PR #8 at the source
  - 174 tests, 22 files, 11 gates, lint all pass

VERIFY EACH CLAIM DIRECTLY — JWT FIRST, IT IS THE HIGHEST-CONSEQUENCE PART

1. Read the JWT validation code directly:
   packages/safety/src/jwt.ts
   Confirm algorithm is pinned at BOTH the header check and the
   key-import filter — a token whose header claims RS256 but whose
   actual key material is a symmetric secret must be rejected before
   any cryptographic operation runs on it, not caught afterward by a
   signature mismatch. This is the exact class of defect (algorithm
   confusion) the previous build's audit praised for being closed
   correctly — confirm it still is.

2. Attack it directly, with real signed tokens against a real local
   JWKS server (the pattern used in earlier reviews — stand one up
   yourself):
     - missing token
     - expired token (real clock, not mocked — let a token's exp pass)
     - not-before in the future
     - wrong issuer, wrong audience
     - alg:none
     - a token signed with a symmetric secret, header claiming RS256
       (HS256-confusion)
     - a token with a valid signature from an OLD key, after that key
       has been rotated out
   Every one must be REJECTED. Paste the actual rejection for each, not
   a summary.

3. The unknown-kid protection. Hammer the gateway with tokens carrying
   kids that do not exist, from multiple concurrent requests. Confirm
   the JWKS endpoint is hit a BOUNDED number of times, not once per
   request — this is directly against the previous build's
   unauthenticated-amplification vector. Show the actual hit count
   under load, not the count from one request.

4. Key rotation. Rotate a real key on your local JWKS server. Confirm a
   token signed with the OLD key is rejected IMMEDIATELY after the
   gateway's next refresh — not eventually, not after some cache TTL
   nobody documented. Confirm the key map is REPLACED, not merged: after
   rotation, can a token signed with a key from TWO rotations ago still
   validate if it happened to still be cached somewhere?

5. Cross-tenant denial. A real member of tenant A, real valid token,
   requesting resolution scoped to tenant B. Must be denied, not merely
   return different data.

6. The RLS proof for the gateway's OWN connection — this is separate
   from component 42's internal RLS. Confirm the gateway itself sets
   app.current_account correctly for its own queries, tested as a real
   non-superuser role, not the superuser used by default locally.

7. The "no interface gap with component 42" claim. Read the actual call
   site. Confirm the gateway calls component 42's public
   resolvePermissions() and nothing else — no reaching into its pool, no
   bypassing its transaction wrapper. If there IS a gap papered over
   with a workaround, that is a serious finding given how much trouble
   PR #8 was to fix at the source.

8. The trigger-originated path. Confirm it genuinely throws
   unimplemented() with a real tracking reference — not a fabricated
   partial implementation, not a TODO comment doing the work of an
   actual guard.

9. Anything not on this list. This component protects everything
   downstream of it; assume there is something not yet found.

Run pnpm build, pnpm test, pnpm gates (stack up, DATABASE_URL set),
pnpm lint yourself. Paste real output.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
