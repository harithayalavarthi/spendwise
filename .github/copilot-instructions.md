# Instructions for GitHub Copilot

Read and follow **[AGENTS.md](../AGENTS.md)** at the repository root first — it is the single
source of truth for how to work in this repo.

The essentials, in case you only read this file:

- This is Next.js 16 with breaking changes: read the relevant guide in `node_modules/next/dist/docs/`
  before writing Next.js code.
- Every change goes through a branch and a pull request; feature flags (`src/lib/featureFlags.ts`)
  for large or risky changes. Follow `docs/coding-standards.md`, including its privacy invariants:
  real financial data never leaves the machine or enters builds; the local LLM only ever sees a
  transaction description.
- `specs/requirements.md` has every requirement and open bug with an ID — update it in the same PR.
- `docs/architecture.md` and `docs/database-schema.md` are the big picture — update them when
  components, tables, or columns change (DOC-1); `tests/docs.test.ts` fails if they drift.
- Verify with `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
