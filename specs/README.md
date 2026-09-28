# Specs

What SpendWise does, what's still open, and why it's built the way it is — in
one place, with stable IDs. SpendWise existed before this folder did, so these
specs were **reverse-engineered on 2026-09-27** from the README, `docs/`, and
the code. Where they and the code disagree, the code wins until the spec is
corrected (in the same PR as whatever revealed the mismatch).

| File | What it holds |
|---|---|
| [requirements.md](requirements.md) | Every capability and constraint with an ID (e.g. `IMP-3`) and a status: **Built**, **Partial**, **Open**, or **Out of scope** |
| [decisions.md](decisions.md) | Architecture decisions and their trade-offs (ADRs) |
| [roadmap.md](roadmap.md) | Open items in priority order |

## Working with specs

This repo's normal workflow still applies ([docs/workflow.md](../docs/workflow.md),
the `start-feature` skill): a branch and a PR for every change, a feature flag
for anything large or risky.

- **Before building something new:** add or update its requirement here (status
  **Open**) in the same PR, or a spec-only PR first for anything big.
- **When it ships:** flip the status to **Built** in the PR that ships it, and
  reference the IDs in the PR description and commit message.
- **IDs are permanent.** Don't renumber or reuse; mark retired requirements as
  such instead of deleting them.
- **Detail stays in `docs/`.** Requirements link to the relevant doc (schema,
  packaging, Plaid) rather than repeating it.
