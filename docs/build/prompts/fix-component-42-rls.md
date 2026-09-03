# Master prompt — Fix: component 42's RLS was never actually enforced

**Blocks step 2.** Paste into a builder session — this fix belongs to component 42, not to the gateway you were building.

---

```
You are the Builder on the Alter Engine. You reported step 2 blocked
because resolvePermissions() returns nothing under a real non-superuser
role. Correct instinct to stop rather than build a workaround — the
CEO investigated and the fix belongs to component 42, which you did not
build. This session fixes 42; step 2 (component 1) resumes after.

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout -B fix/identity-rls-enforcement origin/main
  pnpm install

WHY THIS EXISTS

Read the migration yourself:

  packages/identity/migrations/001_identity.sql

CREATE POLICY tenant_isolation ON accounts
  USING (id = current_setting('app.current_account', true)::uuid);

No FOR clause. Postgres defaults that to FOR ALL, and reuses USING as
WITH CHECK when none is given separately. So this gates INSERT and
UPDATE, not only SELECT — createAccount's own insert would fail under a
real non-superuser role, not only resolvePermissions.

This has been invisible since component 42 merged because every local
connection uses the `alter` role, a Postgres superuser, and RLS is inert
for a superuser regardless of FORCE. All 171 of component 42's existing
tests, and the review that approved it, ran against a connection where
the policies were structurally present and functionally dormant. It
surfaced only because step 2 was told to prove enforcement against a
genuine non-superuser role — which is exactly what that instruction
was for.

THE FIX

SET LOCAL app.current_account = $1, inside a transaction, for every call
that touches accounts, memberships, or custom_roles. Never a bare SET on
a pooled connection — the pool reuses connections across unrelated
requests, and a session-level SET would leak one caller's tenant context
into the next caller who happens to get the same connection. That is a
correctness AND security defect strictly worse than the one you are
fixing. Confirm this yourself: write a test that runs two SET LOCAL calls
on connections drawn from the pool back to back and shows no leakage.

transferOwnership already uses the correct shape — client.connect(),
BEGIN, COMMIT, ROLLBACK on error. Extend that pattern; do not invent a
second one. Every method below needs the same treatment:

  createAccount    — the id is generated client-side with
                     crypto.randomUUID() BEFORE the inserts. Set
                     app.current_account to that value before either
                     insert runs; the WITH CHECK clause is satisfied
                     because the row being inserted matches what was
                     just set.
  addMember
  removeMember
  setMemberRole
  createCustomRole
  listRoles
  transferOwnership  — already transactional; add SET LOCAL to the
                       existing transaction, do not add a second one.
  resolvePermissions — the one that surfaced the bug
  can

findAccountByName IS AN OPEN QUESTION, NOT YOURS TO RESOLVE SILENTLY

It has no accountId to scope by — that is inherent to looking a tenant up
by name before you know which tenant you are. Do not invent a fix. Report
back with the real options as you see them: leave it globally unscoped
(today it is CLI-only, but this shape is what production code would
inherit if nobody revisits it), give it a separate elevated connection
used deliberately and only for this one operation, or remove it as a
capability and require some other way to identify an account (e.g. the
caller already knows the accountId from having created it). State which
you would pick and why, but do not implement a choice without it being
confirmed.

PROVE IT — against a real non-superuser role, not the existing suite

Your existing 171 tests ran as a superuser and would not have caught this
in the first place; passing again proves nothing new. For at least
createAccount, addMember, transferOwnership, and resolvePermissions,
create a genuine non-superuser Postgres role in your test setup — the
same pattern used to verify the RLS policies existed — and run each
method through it for real. Show:

  - a call scoped to tenant A succeeds and returns real data
  - the same call, with app.current_account unset or set to a different
    tenant, returns nothing or fails, never partial or wrong-tenant data
  - two concurrent calls for different tenants on connections drawn from
    the same pool do not see each other's context

CONSTRAINTS

- Do not weaken the RLS policies themselves to route around this —
  changing FOR ALL to something narrower would silently reopen a
  different gap.
- Do not add `any` or a cast.
- If fixing this reveals the pool itself needs a different acquisition
  pattern (e.g. every public method needs to go through client.connect()
  rather than pool.query()), that is an acceptable and probably necessary
  structural change — say so plainly rather than working around it with
  something narrower.

WHEN DONE

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim. Commit, push to fix/identity-rls-enforcement,
open a PR against main. Do NOT merge.

REPORT

Per method, confirm SET LOCAL is in place and paste the non-superuser
proof — the real accepted-tenant-A output and the real
rejected-or-empty wrong-tenant output. State your recommendation on
findAccountByName plainly. Then confirm step 2's original blocker
(resolvePermissions under the gateway's real request path) is resolved,
so that work can resume.
```
