# Development workflow

Going forward, changes to this repo follow a branch → PR → merge flow instead
of committing straight to `main`. This doc covers the mechanics; it exists so
the convention survives across sessions, not just as something remembered in
one conversation.

## Branches

One branch per feature or fix, off `main`:

```bash
git checkout -b feature/<short-name>   # a new feature
git checkout -b fix/<short-name>       # a bug fix
git checkout -b chore/<short-name>     # docs, config, tooling — no app behavior change
```

Delete the branch (locally and on GitHub) once its PR is merged — there's no
reason to keep it around after `main` has the same commits.

## Feature flags

[`src/lib/featureFlags.ts`](../src/lib/featureFlags.ts) gives a new feature a
toggle, so its branch can merge to `main` before the feature is fully
finished — `main` stays releasable the whole time, instead of a branch
sitting unmerged for days while it's built out.

Use one when a change is large enough to land in more than one PR, or risky
enough that you'd want an instant off-switch after it ships. Skip it for
small, self-contained changes (a bug fix, a doc update, a one-file tweak) —
a flag that exists for a change that shipped complete in one PR is just
overhead with nothing to toggle.

```ts
import { isFeatureEnabled } from "@/lib/featureFlags";

if (isFeatureEnabled("bankSync")) {
  // ...
}
```

Register the name in `FLAG_NAMES` in that file first — an unregistered name
won't type-check, which is deliberate; it stops a flag from being used
without a place recording that it exists. Set it locally via `.env.local`:

```
FEATURE_BANK_SYNC=true
```

**Remove the flag once the feature has fully shipped** — delete the guard,
delete the entry in `FLAG_NAMES`, delete the env var wherever it's set. A
flag nobody ever turns off is dead code with extra steps.

## Pull requests

```bash
git push -u origin <branch-name>
gh pr create --title "..." --body "..."
```

PRs merge into `main` after review — Claude opens the PR and stops there; it
doesn't merge on its own unless explicitly asked to for that PR. Squash-merge
via the GitHub UI (or `gh pr merge --squash`) once it looks good, then delete
the branch.
