# Coding standards

These describe the conventions this codebase already follows — written down
so an agent (or a new contributor) picks them up from this file instead of
having to infer them from reading around, and so they stay consistent as the
project grows past what one person holds in their head.

## TypeScript

- `strict` mode is on (`tsconfig.json`) — keep it on, don't add `// @ts-ignore`
  or `any` to work around a type error. If a type genuinely can't be known
  (e.g. a JSON API response), define an interface for the shape you expect
  and cast once at the boundary, the way `llmCategorize.ts` and the API
  routes already do (`const data = (await res.json()) as { ... }`).
- Exported functions get explicit return types when the inferred type isn't
  immediately obvious from the function name (`categorizeTransaction(): Promise<CategorizeResult>`);
  skip the annotation when it would just repeat what's already obvious.
- Import with the `@/*` path alias (`@/lib/db`, `@/components/...`) rather
  than relative `../../` chains, for anything outside the current directory.

## Comments

Comment the **why**, never the **what**. A comment that explains what the
next line of code does is redundant with the code; a comment earns its place
by recording something the code alone can't show — a constraint, a rejected
alternative, a bug that motivated the current shape, a caveat about
correctness. Compare:

```ts
// bad — restates the code
// loop through transactions and categorize each one
for (const t of transactions) { ... }

// good — explains why this isn't the obvious shape
// Categorization can call out to the local LLM (async I/O), which
// better-sqlite3's synchronous transactions can't wrap — so resolve every
// transaction's category first, then insert everything in one fast,
// synchronous transaction below.
```

This project's existing files (`categorizeTransaction.ts`, `upload/route.ts`,
`recurringPayments.ts`) are good references for the level of detail expected.

## Errors, fallbacks, and logging

- An API route boundary (`src/app/api/*/route.ts`) validates its own input
  and returns `NextResponse.json({ error }, { status })` on failure — it
  doesn't let an unhandled exception become a raw 500 with no explanation.
- A fallback that silently swallows a failure is a debugging trap — it did
  cost real time once already (see the LLM categorizer's history in
  `src/lib/llmCategorize.ts`). If code falls back to a default because
  something failed, log *why* via `src/lib/logger.ts` (`logInfo`/`logWarn`)
  before falling back — don't just `catch { return null }`. Don't use raw
  `console.*` for anything beyond a one-off local debug print you intend to
  delete; anything meant to stay uses the logger, so log lines are
  consistently prefixed and timestamped.
- Only validate/handle errors at actual boundaries (user input, an external
  process like Ollama, a parsed file). Don't add defensive checks for
  conditions that can't happen given how a function is actually called
  internally.

## File organization

- `src/lib/` — framework-agnostic business logic (parsing, categorization,
  analytics, db access). No Next.js imports here; these functions should be
  callable from a plain Node script or a test with no special setup.
- `src/app/api/*/route.ts` — the HTTP boundary only: parse the request,
  delegate to `src/lib/`, shape the response. Business logic that grows
  belongs in `src/lib/`, not inline in a route handler.
- `src/app/*/page.tsx` — page-level composition of components.
- `src/components/` — UI. Prefer a component that takes data as props over
  one that fetches its own data, so it stays testable/reusable independent
  of a particular route.

## Data and money

- Dates are stored and passed around as ISO date strings (`YYYY-MM-DD`), not
  `Date` objects, to avoid timezone drift between parsing, storage, and
  display — see `src/lib/parseStatement.ts`'s `parseDateToken`.
- Amounts are plain JS numbers, sign-convention-aware (see the checking vs.
  credit-card handling in `parsePdfStatement.ts` and the README's "Notes"
  section) — never format or round until display time.
- No ORM — raw SQL via `better-sqlite3` prepared statements (`src/lib/db.ts`).
  Keep it that way; the schema is small enough that an ORM would add
  indirection without buying much. New tables/columns get an idempotent
  migration in `db.ts` (see `migrateHashColumn`/`migrateInstitutionColumn`
  for the pattern) and a matching update to
  [docs/database-schema.md](database-schema.md).

## Data visualization

Any new chart follows the rules in the project's `dataviz` skill: assign
categorical colors by identity in a fixed order (never cycle or re-rank on
filter), never use a dual-axis chart, sequential data gets one hue light→dark,
diverging data gets two hues with a neutral midpoint. See
`src/components/chartColors.ts` for this project's palette plumbing
(`getSeriesColorMap`) before hand-rolling colors for a new chart.

## Privacy and security invariants

These are non-negotiable for this project specifically — verify them, don't
just reason about them, per the incidents that established each one:

- Real financial data must never end up in a build artifact. `next.config.ts`'s
  `outputFileTracingExcludes` and `build/afterPack.js`'s copy filter both
  exclude `data/**` and `*.db*` — if you touch either, rebuild and run
  `find .next/standalone -iname "*.db*"` / `find release -iname "*.db*"`
  and confirm both come back empty (see [docs/packaging.md](packaging.md)).
- The local LLM (`src/lib/llmCategorize.ts`) only ever receives a transaction
  *description* — never an amount, a date, or account info — and only talks
  to `localhost`. Don't widen what gets sent to it without discussing that
  change explicitly first.
- Never commit test/synthetic upload data into the real `data/spendwise.db` —
  any manual testing against a real dev server gets cleaned up afterward
  (`DELETE /api/statements?id=...`) with a before/after row-count check, the
  way every test upload in this project's history has been handled.

## Testing

There's no automated test suite yet (no Jest/Vitest configured). Until one
exists, a change is verified by actually running it: `npm run typecheck`,
`npm run lint`, `npm run build`, and exercising the real flow against a dev
server (upload a throwaway file, check the result, clean up the test
statement afterward) rather than asserting a change is correct by reading
the diff alone. If you add a real test framework, update this section.
