# Master prompt — Finalize the component 42 RLS fix

**Follow-up to the uncommitted RLS fix.** Paste into the same builder session.

---

```
Your RLS fix report is received. Not accepted on trust yet — it goes to
review once pushed. Two things before that.

CEO DECISION ON findAccountByName: KEPT, NOT REMOVED

Overruling your recommendation, with reasoning recorded in
docs/build/DECISIONS.md. It returns only accountId and name, no tenant
data of consequence, and removing it would force the CLI to work by id
instead of name — breaking the exact name-based interface that proved
step 1 (`pnpm identity account create "Havish Labs"`, `member add
"Havish Labs" ...`).

Kept on one condition: it must be unreachable from component 1's gateway
or any tenant-facing surface. Implement that as a real boundary, not a
comment:

  - it should not be part of any interface component 1 imports or wraps
  - name it and document it plainly as internal-tooling-only — a doc
    comment on the method itself, stating it must never be exposed to a
    request from a real tenant caller
  - if there is a natural way to make this structural rather than only
    documented (a separate export path, a distinct module the CLI
    imports that component 1 does not), take it; if there is not, the
    doc comment is the boundary for now and that is acceptable

FINALIZE AND PUSH

  pnpm build
  pnpm test
  pnpm gates      (pnpm stack:up, DATABASE_URL set)
  pnpm lint

Paste all four verbatim if anything changed from your last run. Then:

  git add -A
  git commit    (your own message, describing the fix)
  git push -u origin fix/identity-rls-enforcement

Open a PR against main. Do NOT merge.

DO NOT resume component 1 yet. Your stashed work
("wip component-1 tenant gateway") stays stashed until this PR is
reviewed and merged — component 1 should build against the real merged
fix, not against your local uncommitted state, in case review finds
something.

REPORT

The PR link, and confirmation the findAccountByName boundary is real
(where it lives, what imports it, what does not).
```
