---
name: start-feature
description: Start a new feature or fix in this repo the right way — branch, optional feature flag, verification, and a PR. Use this whenever asked to build, fix, or change something in spendwise, before writing any code.
---

# Starting a change in spendwise

This repo requires every change to go through a branch and a pull request —
see [docs/workflow.md](../../docs/workflow.md) for the full rationale. This
skill is the operational checklist.

## 1. Branch

Branch off the latest `main`, named for what it does:

```bash
git checkout main && git pull
git checkout -b feature/<short-name>   # new capability
git checkout -b fix/<short-name>       # bug fix
git checkout -b chore/<short-name>     # docs/config/tooling, no app behavior change
```

Never commit directly to `main`.

## 2. Decide: does this need a feature flag?

Read `docs/workflow.md`'s "Feature flags" section for the full rule. Quick
version: yes if the change will span more than one PR, or is risky enough
you'd want an instant off-switch after it ships. No for a self-contained
bug fix, doc update, or small one-PR change.

If yes: register a `camelCase` name in `src/lib/featureFlags.ts`'s
`FLAG_NAMES`, with a `// added <date>` comment, then guard the code with
`isFeatureEnabled("name")`.

## 3. Implement, following docs/coding-standards.md

Read [docs/coding-standards.md](../../docs/coding-standards.md) before
writing code — it covers this project's TypeScript conventions, comment
policy (why, not what), logging (use `src/lib/logger.ts`, not raw
`console.*`), file organization, and the privacy/security invariants that
must never regress (no real financial data in build output, the LLM only
ever sees transaction descriptions, test data never mixes into the real db).

## 4. Verify before opening the PR

There's no automated test suite yet, so verification is: run these, and
actually exercise the change against a real dev server.

```bash
npm run typecheck
npm run lint
npm run build
```

If the change touches the upload/categorization/parsing pipeline, start the
dev server, upload a throwaway test file, confirm the behavior, then delete
the test statement (`DELETE /api/statements?id=...`) and confirm the real
transaction count is back to where it started — never leave synthetic data
mixed into the real database.

## 5. Open the PR

```bash
git push -u origin <branch-name>
gh pr create --title "..." --body "..."
```

Stop there. Don't merge the PR unless explicitly told to merge that specific
PR — the person reviews and merges (or asks for the merge) on their own
timeline. After it's merged, delete the branch.
