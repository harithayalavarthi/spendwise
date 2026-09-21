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
  extracts raw text and locates transactions line-by-line with regex — it has no
  notion of your bank's actual table layout. Handled per line: one or two leading
  dates (transaction + posting date, with or without a year — the year is inferred
  from the statement date/period printed elsewhere in the document), and an amount
  token found anywhere on the line (column order in extracted text doesn't always
  match the visual layout — some statements print the amount right after the date,
  others at the end followed by a running balance, which is detected and dropped).
  Always spot-check a PDF import against the actual statement. Scanned/image-only
  PDFs won't parse at all — export CSV instead.
- **Credit card statements are detected** (via "new balance" / "minimum payment" /
  "credit limit" wording) and handled with the opposite sign convention from a
  checking account: an unsigned line is a charge (expense), and a payment/credit
  is categorized as a Transfer rather than income — otherwise paying down your
  card would show up as a spike in "income." Transfers are excluded from income,
  expense, and savings-rate totals everywhere in the dashboard.
- Duplicate detection is a hash of (date, description, amount) — a false positive
  is possible if you have two genuinely identical transactions on the same day
  (e.g., two identical $5 coffees); the second one will be silently skipped.
- Categorization is keyword-based (`src/lib/categories.ts`, punctuation-normalized
  so "WAL-MART" matches "walmart") — extend the keyword lists there for merchants
  it misses. Local/regional merchants will often land in "Other"; use the
  Transactions page to fix them up.
