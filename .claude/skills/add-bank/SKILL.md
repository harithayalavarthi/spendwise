---
name: add-bank
description: Add auto-detection support for a new financial institution's statements, or fix parsing for a bank whose CSV/PDF format isn't handled correctly. Use this when a statement from a bank not yet recognized fails to parse well or isn't auto-detected.
---

# Adding a financial institution

## 1. Register the institution name for auto-detection

`src/lib/detectInstitution.ts`'s `INSTITUTION_RULES` is a keyword list
matched (case-insensitive, substring) against the statement's own text. Add
an entry:

```ts
{ name: "New Bank", keywords: ["new bank", "newbank.com"] },
```

Pick keywords from the exact wording that appears in a real statement from
that bank — the bank's letterhead name, not a guess. This is a convenience
default only; a user-typed institution on the upload form always overrides
it (see `src/app/api/upload/route.ts`).

## 2. Check the sign convention

Checking/debit accounts and credit cards use **opposite** sign conventions
(an unsigned line is income for a checking account, but a charge/expense for
a credit card) — see `parsePdfStatement.ts`'s `looksLikeCreditCardStatement`
and `CREDIT_CARD_INDICATORS`, and the README's "Notes" section. If the new
statement is a credit card and isn't being detected as one, extend
`CREDIT_CARD_INDICATORS` with wording from the real statement (e.g. "new
balance", "minimum payment", "credit limit" — whatever that issuer actually
prints).

**This has bitten this project before** — see `docs/database-schema.md`'s
"Known issues" entry on the Scotiabank sign bug. Get this right the first
time; a sign-convention miss silently inverts income and expenses.

## 3. If it's a PDF and doesn't parse well at all

PDF parsing (`src/lib/parsePdfStatement.ts`) is heuristic, not a real table
parser — every bank's PDF is a different content-stream layout. Common
failure points, in order of likelihood:

- **Amount not found on a candidate line** — the parser searches for a money
  token anywhere on the line, since PDF text-extraction order doesn't always
  match visual column order. If it's still missing, the amount format itself
  might not match `MONEY_TOKEN`'s regex (e.g. a currency symbol or thousands
  separator style not yet handled).
- **Dates not recognized** — `NUMERIC_DATE_RE` / `MONTH_NAME_DATE_RE` cover
  common formats; a new format needs a new pattern.
- **Statement boilerplate mistaken for a transaction** (or the reverse) —
  check `src/lib/statementNoise.ts`'s `isStatementNoise()` regex list.

With the logging added in this project (`src/lib/logger.ts`), every skipped
candidate line now logs its raw text via `[pdf-parse]` — start the dev
server, upload the real statement, and read the server console for exactly
which lines failed and why, instead of guessing from the PDF alone.

## 4. Test and clean up

Upload the real (or a synthetic, never-committed) statement against a
running dev server, confirm the transaction count/categories/institution/
sign convention all look right, then delete the test statement
(`DELETE /api/statements?id=...`) and confirm the real transaction count is
unchanged. Never leave synthetic test data mixed into the real database.

## 5. Follow start-feature for the actual change

This is a normal code change — branch, verify, PR. See the `start-feature`
skill.
