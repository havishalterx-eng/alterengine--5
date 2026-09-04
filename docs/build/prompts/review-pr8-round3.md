# Master prompt — Adversary review of PR #8, round 3

**After the NULLIF fix.** Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #8, branch fix/identity-rls-enforcement, against main. Not merged.
Two prior rounds: round 1 approved the transaction/SET LOCAL structure
but found finding 1 (RLS policies crash on connection reuse after an
empty-string GUC reset) and finding 2 (a teardown TypeError claim).
Finding 2 was independently verified by the CEO not to reproduce on this
branch and was rejected as inaccurate — do not re-raise it unless you
find something the CEO's check missed; if you do, be specific about what
changed.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout fix/identity-rls-enforcement
  git pull
  pnpm install && pnpm build

Do not trust the report. Run it yourself.

THE BUILDER'S CLAIM ON FINDING 1

All three RLS policies changed to:
  NULLIF(current_setting('app.current_account', true), '')::uuid
Reported before/after: the exact reused-connection scenario from round 1
now returns {"tenantARows":1,"reusedNoContextRows":0,"wrongTenantRows":0}
instead of throwing.

VERIFY

1. Reproduce the exact reused-connection scenario yourself, as a real
   non-superuser: BEGIN, SET LOCAL app.current_account, COMMIT, then a
   SEPARATE transaction on the same connection with no context reset.
   Confirm it returns zero rows and does not throw.

2. Re-run everything that passed in round 1 — do not assume a fix to
   one policy expression left the rest untouched. createAccount,
   transferOwnership, resolvePermissions, the 80-concurrent-pair
   isolation test. All against a real non-superuser role.

3. Confirm the teardown files were genuinely not touched:
     git diff main -- packages/audit/src/audit-store.test.ts packages/audit/src/verifier.test.ts
   Empty diff expected. If not empty, that is a real finding — the
   builder was explicitly told not to touch them.

4. Try to break the NULLIF fix itself. What happens with a value that is
   present but not a valid UUID shape (not empty, not null, just
   malformed)? Does that still throw, and if so, is that acceptable —
   a malformed session variable is an engine bug, not a tenant boundary
   question, so throwing there may be correct. Say which you think it
   should be and why, don't just report the behaviour.

5. Anything not on this list.

Run pnpm build, pnpm test, pnpm gates (stack up, DATABASE_URL set),
pnpm lint yourself. Paste real output.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
