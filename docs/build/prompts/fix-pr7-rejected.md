# Master prompt — Fix PR #7's rejected finding, plus RLS

**PR #7 (component 42) rejected on independent review.** One defect, plus a CEO decision on the RLS question you raised. Paste into the same builder session.

---

```
You are the Builder on the Alter Engine. PR #7 was reviewed and REJECTED.
One defect, confirmed by reproducing it against real Postgres. Plus a
decision on the RLS question your report raised.

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout component/42-identity-membership
  git pull

WHAT WAS CONFIRMED WORKING — do not touch these

  - the ten-toggle model, owner separation, custom-role SQL-level scoping
    (WHERE account_id = $1, not app-level filtering)
  - fail-closed on unknown user/account/role
  - the no-console eslint carve-out, correctly scoped

THE DEFECT — transferOwnership leaves the new owner locked out

createAccount deliberately gives its founder BOTH owner_user_id AND an
Admin membership row — your own comment says so, correctly. But
transferOwnership only updates owner_user_id. It never creates a
membership for the successor.

Reproduced: transfer ownership to a genuine non-member, and
resolvePermissions() returns null — indistinguishable from "not a
member" — while can() for an owner-only action correctly returns true
through its independent owner_user_id fallback. The new owner can act
one permission at a time through can(), but cannot see their own
permission set, cannot create a workflow, cannot invite anyone. The
CLI's member show — the physical test for this entire step — would
report the legitimate new owner as not found.

Your own done gate item 2 says "Owner: yes. Transfer moves them," but
that transfer was tested against a successor who was already an Admin
member. The untested path — a genuine non-member — is the realistic one:
an owner transferring to someone outside the existing team.

Fix: transferOwnership must leave the successor with functioning access,
the same way createAccount does. The straightforward fix is to upsert an
Admin membership for the successor as part of the transfer — mirroring
createAccount's own pattern exactly, in the same transaction as the
owner_user_id update, so there is no window where ownership has moved but
membership has not caught up.

Do NOT remove the previous owner's Admin membership. They were already a
regular Admin member from account creation; that is fine to leave as-is,
it is not a new problem this fix needs to solve.

Prove it with the exact scenario that broke: transfer to a genuine
non-member, then resolvePermissions() for the new owner must return a
real permission set, not null, and can(create_workflow) must be true.

RLS — CEO DECISION ON YOUR QUESTION

Add RLS with FORCE to accounts, memberships, and custom_roles now. Do not
defer the policies themselves to step 2 — only the enforcement TEST is
deferred, because it genuinely cannot be meaningful until component 1
supplies real per-request tenant context, and a local Postgres superuser
bypasses RLS regardless of what policies exist.

Add the policies as part of this PR. A comment on each should say plainly
that enforcement is unverifiable today and will be proven once component
1 lands in step 2 — write down the gap rather than let it look silently
closed.

CONSTRAINTS

- Do not weaken anything confirmed working above.
- The fix must be transactional — owner_user_id and the successor's
  membership row change together, or not at all.
- If adding RLS surfaces something about the schema that makes it awkward
  (a column not yet fitting a tenant boundary, for instance), report it
  rather than working around it silently.

WHEN DONE

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim. Commit, push to
component/42-identity-membership.

REPORT

The exact non-member-transfer scenario, run against your fix, with
resolvePermissions() and can() output before and after. Confirm the RLS
policies are added and state plainly that their enforcement is unproven
until step 2 — do not imply they are fully verified when they cannot be.
```
