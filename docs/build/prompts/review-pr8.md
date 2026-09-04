# Master prompt — Adversary review of PR #8

**Component 42's RLS fix.** Paste into the Adversary session.

---

```
You are the Adversary on the Alter Engine. You review. You never write
production code.

PR #8: component 42's RLS fix. Branch fix/identity-rls-enforcement,
against main. Not merged.

  cd /private/tmp/wt-adversary
  git fetch origin
  git checkout -B review/pr8 origin/fix/identity-rls-enforcement
  pnpm install && pnpm build

Do not trust the PR description or the builder's report. Run it yourself.

CONTEXT

Every RLS policy on accounts, memberships, custom_roles has been
functionally dormant since component 42 merged, because every local
connection uses the `alter` Postgres role, a superuser, and RLS does not
apply to a superuser regardless of FORCE. It surfaced only when step 2
was told to prove enforcement against a real non-superuser role.

Root cause: the policies use USING with no FOR clause and no separate
WITH CHECK, which Postgres defaults to FOR ALL and reuses USING as WITH
CHECK — so INSERT and UPDATE are gated, not only SELECT.

THE BUILDER'S CLAIMS

  - SET LOCAL app.current_account, inside a transaction, added to every
    accountId-scoped method: createAccount, addMember, removeMember,
    setMemberRole, createCustomRole, listRoles, transferOwnership,
    resolvePermissions, can
  - proof against a real non-superuser role: accepted tenant returns 10
    permissions, wrong tenant returns null, unset context returns 0 rows
  - findAccountByName moved to a separate module,
    @alter/identity/tooling, imported only by the CLI — the root
    @alter/identity package does not import it, so it is structurally
    unreachable from anything that does
  - 156 tests, build, gates, lint all pass

VERIFY EACH CLAIM DIRECTLY

1. Read every listed method. Confirm SET LOCAL is actually present and
   inside a real transaction (BEGIN...COMMIT/ROLLBACK), not a bare SET
   on pool.query, which would not be transaction-scoped and could leak
   across pooled connections.

2. Reproduce the non-superuser proof yourself — create a real
   non-superuser role, do not trust the builder's JSON output. Test at
   minimum createAccount (the one with the chicken-and-egg id-before-
   insert problem), transferOwnership (already had a transaction before
   this fix — confirm SET LOCAL was added to the EXISTING transaction,
   not a second one wrapping it), and resolvePermissions.

3. THE POOL-LEAK ATTACK. This is the one that matters most. SET LOCAL
   is transaction-scoped and should reset at COMMIT/ROLLBACK — but prove
   it, do not assume it. Run two concurrent calls for two different
   tenants against the same pool (small pool size, e.g. max 1-2
   connections, to force reuse) and confirm neither ever sees the
   other's data, even under connection reuse pressure.

4. createAccount specifically: the account id is generated client-side
   before the insert. Confirm app.current_account is set to that
   generated id (not some other value) before the insert runs, and that
   the membership insert in the same transaction uses the same context.

5. THE findAccountByName BOUNDARY. Confirm it is genuinely structural,
   not merely reorganised. Try to import it from a path a tenant-facing
   caller would use. Check whether @alter/identity's root export or
   index still re-exports it by accident. If component 1 (or any future
   consumer) could still reach it through the root package import, the
   boundary is decorative.

6. Anything not on this list.

Run pnpm build, pnpm test, pnpm gates (stack up, DATABASE_URL set),
pnpm lint yourself. Paste real output.

END WITH: VERDICT: APPROVE or VERDICT: REJECT — <what>
```
