# Master prompt — Fix PR #8's one real finding

**One finding accepted, one rejected as inaccurate.** Paste into the same builder session.

---

```
You are the Builder on the Alter Engine. PR #8 was reviewed. One finding
is real and confirmed independently; one is not and you should NOT act
on it.

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout fix/identity-rls-enforcement
  git pull

FINDING 1 — REAL, FIX THIS

The RLS policies cast current_setting('app.current_account', true)
directly to ::uuid, with no guard. Postgres resets a custom GUC to an
EMPTY STRING after a SET LOCAL transaction commits, not NULL. So any
transaction on a connection that was previously used for a tenant, and
does not explicitly reset the value, throws a raw Postgres error instead
of cleanly denying:

  ERROR: invalid input syntax for type uuid: ""

Confirmed independently as a real non-superuser: BEGIN, set the value,
COMMIT, then a second transaction querying accounts throws that exact
error rather than returning zero rows. That is worse than the defect
being fixed — an unhandled exception on connection reuse, not a silent
correct deny.

Fix: in packages/identity/migrations/001_identity.sql, every policy —
accounts, memberships, custom_roles — needs:

  NULLIF(current_setting('app.current_account', true), '')::uuid

instead of the bare cast. NULLIF turns the empty string into a real NULL
before the cast runs, and NULL compared to anything is false, which is
the correct fail-closed behaviour — a request with no tenant context set
denies cleanly rather than crashing.

Prove it with the exact scenario that broke: a transaction that sets and
commits a tenant context, followed by a SEPARATE transaction on a
connection that has been reused, with no context reset. It must return
zero rows, not throw. Then confirm the accepted-tenant and wrong-tenant
cases from your original proof still hold with the guard in place.

FINDING 2 — DOES NOT REPRODUCE, DO NOT TOUCH ANYTHING FOR IT

The report claimed audit-store.test.ts and verifier.test.ts crash with a
TypeError in teardown. Independently verified: the guard from PR #5
round 3 is present and working correctly in both files. Ran both in
isolation and the full suite with DATABASE_URL unset — zero TypeErrors,
every failure a clean ConfigurationError. This finding does not describe
the code on this branch.

Do NOT modify either test file's teardown. It is correct as-is. Changing
working code to chase a finding that does not reproduce is how a real
regression gets introduced while fixing nothing.

CONSTRAINTS

- Do not touch anything else confirmed working: the SET LOCAL transaction
  wrapping, the non-superuser proof, the findAccountByName boundary.
- Do not weaken types, add `any`, or silence a gate.

WHEN DONE

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim. Commit, push to fix/identity-rls-enforcement.

REPORT

The exact reused-connection scenario, before and after the NULLIF fix,
with real output. Confirm you did not touch either audit test file.
```
