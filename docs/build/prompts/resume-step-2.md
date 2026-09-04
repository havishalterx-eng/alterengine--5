# Master prompt — Resume step 2, component 1

**Component 42's RLS gap is merged and closed.** Paste into the builder session that stashed component 1's work.

---

```
Component 42's RLS fix is merged to main (4f2ea67). Resume step 2 against
the real merged state, not your stashed local work.

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout -B component/1-identity-tenant-gateway origin/main
  git stash list

Your stash ("wip component-1 tenant gateway") was made on an older base.
Do not blindly pop it — main has moved (component 42's RLS fix,
findAccountByName's tooling boundary). Apply it with:

  git stash pop

and resolve any conflict by hand, checking each hunk against what main
now actually looks like rather than accepting either side automatically.
If the conflict is small, this is faster than rebuilding from scratch.
If it is large or confusing, rebuilding the gateway from scratch against
current main is the safer choice — say which you did.

Once your worktree is clean and building, resume exactly where step 2
left off. Your original task is unchanged — re-read it if you need to:

  docs/build/prompts/step-02-component-1.md

One thing to verify given what just happened: your resolvePermissions
call into component 42 must now work correctly, because component 42
itself sets tenant context internally via SET LOCAL on every
accountId-scoped call. You should NOT need to reach into component 42's
pool or set app.current_account yourself for calls that go through its
public methods — that was the whole point of fixing it at the source
rather than coupling the gateway to component 42's internals. If you
still hit the original blocker after this, that is a new finding, not
the same one — report it precisely rather than assuming it is unresolved.

Continue to done gate items 1 through 5, the JWT work, and the RLS proof
this step owes for its OWN connection (setting app.current_account for
requests that reach component 1 directly, separate from what component
42 now does for itself).
```
