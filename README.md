# SpendWise

Upload bank statements (CSV or PDF), auto-categorize transactions, and get spending
analytics and suggestions to keep your finances on track. All data is stored locally
in a SQLite database — nothing leaves your machine.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- SQLite via `better-sqlite3` (file at `data/spendwise.db`, gitignored)
- `papaparse` for CSV parsing, `pdf-parse` for PDF text extraction, `recharts` for charts

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then go to **Upload** and pick a
statement from your bank.

## How it works

- **Upload** (`/upload`): parses a CSV (auto-detects date/description/amount or
  debit+credit columns) or a PDF (heuristic line-based extraction — see caveat
  below), categorizes each transaction with keyword rules (`src/lib/categories.ts`),
  and stores it. Duplicate transactions (same date, description, and amount as one
  already stored) are detected via a content hash and skipped automatically, so
  re-uploading a statement — or a second export that overlaps by a few days — won't
  double-count anything.
- **Dashboard** (`/`): spending by category, income vs. expenses over time, and
  rule-based suggestions (top category share, month-over-month spikes, savings
  rate, recurring subscriptions).
- **Transactions** (`/transactions`): browse and manually re-categorize any
  transaction; filter by category.

## Notes

- **CSV is more reliable than PDF.** PDF parsing (`src/lib/parsePdfStatement.ts`)
  extracts raw text and guesses columns line-by-line with regex — it has no notion
  of your bank's actual layout, and it guesses the debit/credit sign when a line
  doesn't show one explicitly (keyword-based: "deposit", "payroll", etc. read as
  income, everything else as an expense). Always spot-check a PDF import against
  the actual statement, especially deposits. Scanned/image-only PDFs won't parse
  at all — export CSV instead.
- Duplicate detection is a hash of (date, description, amount) — a false positive
  is possible if you have two genuinely identical transactions on the same day
  (e.g., two identical $5 coffees); the second one will be silently skipped.
- Categorization is keyword-based (`src/lib/categories.ts`) — extend the keyword
  lists there for merchants it misses.
