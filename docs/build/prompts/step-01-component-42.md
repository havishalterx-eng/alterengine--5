# Master prompt — Step 1, Component 42: Identity & Membership

**First step of the sequential build.** Paste into a builder session. Do not send until PR #4 is resolved.

---

```
You are the Builder on the Alter Engine. Repo:
https://github.com/havishalterx-eng/alterengine--5

Read first, in this order:
  1. AGENTS.md
  2. docs/build/METHOD.md              — how this build runs, and your role
  3. docs/build/SEQUENTIAL-BUILD-ORDER.md  — step 1 only
  4. docs/architecture/contracts.md    — section 42 only
  5. docs/RULES.md                     — the four systemic patterns

State before writing code: your component, the done-gate items you must
satisfy, and the files you read.

WORKTREE

  cd /private/tmp/wt-builder-a
  git fetch origin
  git checkout -B component/42-identity-membership origin/main
  pnpm install

Your database is alter_builder_a. Do not use alter, and do not use another
builder's. Configuration comes from loadConfig() in @alter/contracts —
never process.env directly, never the .env file. Gates enforce both.

WHAT YOU ARE BUILDING

Component 42 stores who belongs to a tenant and what each member may do.

The enforce/manage split is the whole point. Component 1 ENFORCES
permission on each request. This component STORES AND MANAGES the facts
underneath. The previous build's critical defect lived exactly in that
gap: its gateway derived roles from real database queries and then set
permissions to a literal empty array, because nothing anywhere derived a
permission from a role. Everything looked correct and nobody could do
anything.

Your done gate item 1 exists to close that specific hole.

THE MODEL, EXACTLY AS THE CONTRACT SPECIFIES

Ten permission toggles, bounded and closed. Not nine, not eleven, and no
extension mechanism:
  create workflow · edit workflow · view workflow · approve at a
  HumanApproval node · review a self-heal replacement · manage tool
  credentials · set a workflow budget cap · invite or remove members and
  assign roles · view billing · change data retention settings

A role is {name, set of those ten toggles}. Predefined roles are shipped
presets of that shape. A custom role is an owner naming their own
combination. ONE data model, not two systems — if you find yourself
writing separate handling for predefined versus custom roles, stop and
reconsider.

Owner is NOT a role. Owner-only actions — billing, transferring
ownership, deleting the account — can never be granted through any role,
including Admin. Owner belongs to the tenant's creator or an explicit
deliberate transfer. Do not model it as an eleventh toggle or as a
predefined role, because either makes it grantable.

Custom roles are private to their tenant.

DONE GATE — all five, each as an executable test against real Postgres

  1. A real member with a real role resolves to a NON-EMPTY permission
     set. This is the one that closes the previous build's defect. Prove
     it end to end against the database, not against a fixture.
  2. Admin cannot perform an owner-only action.
  3. A custom role is invisible to another tenant.
  4. Removing a member immediately revokes access, verified against a
     live session rather than by assertion.
  5. Registered with Deletion & Retention — add your tables to
     tenantDataDeclarations in packages/deletion-registry. The
     deletion-schema gate reads the live schema and will fail if you do
     not.

Write these tests FIRST. If any cannot be written as an executable test
right now, STOP and report which and why. Do not build around it.

THE PHYSICAL TEST — this is how the step closes

There is no UI yet; the console arrives at step 3. So provide commands a
human runs in a terminal, and show the real output:

  - create an account
  - add a member with a role
  - show that member's resolved permissions

The last one must print a real, non-empty permission list read from the
database. That output is what proves step 1, so make the commands
discoverable and their output readable by a person, not just parseable.

CONSTRAINTS

- Fail closed. Never grant a permission that cannot be confirmed.
- Do not enforce permissions per request — that is component 1, step 2.
  Build the resolution, not the middleware.
- Do not weaken types, add `any`, or silence a gate.
- Do not modify another component to make yours work. If something else
  is wrong, report it.
- If you get stuck in a retry loop, STOP and report rather than burning
  turns.

WHEN DONE

Run all four and paste the output verbatim:
  pnpm build
  pnpm test
  pnpm gates      (stack up: pnpm stack:up, and DATABASE_URL set)
  pnpm lint

Then commit, push to component/42-identity-membership, and open a PR.
Do NOT merge — the Adversary reviews, the CEO merges.

REPORT

What you built, the verbatim output of the physical test commands, and
anything about the contract that was wrong, ambiguous, or impossible.

That last part is not a formality. On the previous task the builder
reported "no interface problem" and there were two, plus a CI-breaking
bug. A report claiming everything was clean is the least useful report
you can file. If something was awkward, say so.
```
