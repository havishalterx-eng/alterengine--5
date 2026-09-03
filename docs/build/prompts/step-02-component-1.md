# Master prompt — Step 2, Component 1: Identity & Tenant Gateway

**Second step of the sequential build.** Paste into a builder session.

---

```
You are the Builder on the Alter Engine. Repo:
https://github.com/havishalterx-eng/alterengine--5

Read first, in this order:
  1. AGENTS.md
  2. docs/build/METHOD.md              — how this build runs, and your role
  3. docs/build/SEQUENTIAL-BUILD-ORDER.md  — step 2 only
  4. docs/architecture/contracts.md    — section 1 only
  5. docs/RULES.md                     — "What the previous build got right",
     the JWT validation paragraph specifically
  6. packages/identity/src/            — component 42, just merged. You
     consume it directly.

State before writing code: your component, the done-gate items you must
satisfy, and the files you read.

WORKTREE

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout -B component/1-identity-tenant-gateway origin/main
  pnpm install

Your database is alter_builder_a. Configuration through loadConfig() from
@alter/contracts — never process.env directly, never the .env file.

WHY THIS COMPONENT MATTERS MORE THAN MOST

This is one of very few components rated whole-engine blast radius on
purpose: if it is unavailable, nothing works. Its done-gate item 1 is
written directly against the previous build's worst defect — that build
hardcoded `permissions: []` in exactly this component, so every real
request got a 403, and the unit test PASSED because it injected
permissions directly rather than deriving them, a state no real request
could ever produce.

Your own equivalent trap: writing a test that constructs an ActorContext
by hand with permissions already attached, rather than deriving them
through component 42 the way a real request would. If you catch yourself
doing that, stop — it is the same defect wearing a different shape.

SCOPE FOR THIS STEP — two things deliberately narrowed, decided by the CEO

1. JWT validation does not exist anywhere in the repo yet. Build it into
   @alter/safety, not into a new package and not inline in this
   component — contract 1 lists Safety as the plane owner of JWT
   validation, and rule 18 means one definition, consumed here and later
   by Public Surface. Use `jose` for the cryptography. Carry forward
   exactly what the previous build's audit rated ahead of most
   production systems: algorithm pinned at BOTH the header check and the
   key-import filter, issuer matched exactly, audience validated, expiry
   and not-before checked with bounded clock skew. Do not weaken any of
   that; if you think you have an improvement, escalate before writing it.

2. Contract done-gate item 6 — trigger-originated tenant resolution, no
   human actor present — depends on components that do not exist yet
   (Event & Trigger Gateway at step 32, workflow-ownership facts from
   Workspace & Workflow Management at step 14). Build the TYPED entry
   point for this path now, so nothing later has to retrofit the shape.
   Do NOT build a fabricated end-to-end test for it — that produces a
   test that looks like proof of something that cannot be proven yet.
   Mark the gap explicitly and record it as a mandatory revisit at step
   32. This is not a shortcut; it is the honest alternative to faking it.

DONE GATE — items 1 through 5, each as an executable test against real
Postgres and a real JWKS endpoint

  1. A real member with a real role, going through component 42, produces
     a non-empty permission set at the OTHER end of a full request —
     token in, ActorContext out. This is the test the previous build
     never had. Do not construct the ActorContext by hand.
  2. Rejects: missing token, expired token, wrong issuer, wrong audience,
     alg:none, HS256-confusion (a token signed with a symmetric secret
     presented as if it were RS256-verifiable with a public key). Stand
     up a real local JWKS-serving HTTP server for this — the same
     pattern the SSRF guard tests use — and sign real tokens against it
     with `jose`, rather than asserting behaviour against fixtures.
  3. An unknown `kid` does not trigger unbounded outbound JWKS fetches.
     Negative cache plus a rate limit. Prove it: hammer the gateway with
     requests carrying unknown kids and show the JWKS endpoint is hit a
     bounded number of times, not once per request.
  4. Rotated-out signing keys stop validating. The key map is REPLACED on
     refresh, never merged — prove it by rotating a real key and showing
     a token signed with the old one is rejected immediately after
     refresh, not eventually.
  5. A cross-tenant request is denied. A real member of tenant A
     presenting a valid token cannot resolve permissions or receive an
     ActorContext scoped to tenant B.

THE RLS PROOF THIS STEP OWES

Component 42 added RLS with FORCE to accounts, memberships and
custom_roles, and explicitly deferred enforcement testing because no
component yet supplied real per-request tenant context. You are that
component. Once a request resolves to a tenant, set
`app.current_account` for that connection (or transaction) to the
resolved tenant id, and prove — against a REAL non-superuser Postgres
role, the same way it was proven when the policies were added — that a
request scoped to tenant A genuinely cannot read tenant B's rows at the
database level, not merely that your application code happens not to ask
for them.

CONSTRAINTS

- Fail closed, absolutely. Deny whenever identity or permissions cannot
  be established — never a default allow, never a partial ActorContext.
- Do not modify component 42 to make this easier. If its interface does
  not fit, report exactly what does not fit.
- Do not weaken types, add `any`, or silence a gate.
- If you get stuck in a retry loop, STOP and report rather than burning
  turns.

WHEN DONE

Run all four and paste the output verbatim:
  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Then commit, push to component/1-identity-tenant-gateway, and open a PR.
Do NOT merge — review happens first, the CEO merges.

REPORT

What you built, the verbatim output of each done-gate proof (not a
summary — the actual rejected-token error text, the actual JWKS hit
count, the actual RLS row count as a non-superuser), and anything about
the contract or component 42's interface that was awkward, wrong, or
impossible. A report claiming everything was clean is the least useful
report you can file.
```
