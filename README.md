# SpendWise

Upload bank statement CSVs, auto-categorize transactions, and get spending analytics
and suggestions to keep your finances on track. All data is stored locally in a
SQLite database — nothing leaves your machine.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- SQLite via `better-sqlite3` (file at `data/spendwise.db`, gitignored)
- `papaparse` for CSV parsing, `recharts` for charts

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then go to **Upload** and pick a
CSV export from your bank.

## How it works

- **Upload** (`/upload`): parses a CSV (auto-detects date/description/amount or
  debit+credit columns), categorizes each transaction with keyword rules
  (`src/lib/categories.ts`), and stores it.
- **Dashboard** (`/`): spending by category, income vs. expenses over time, and
  rule-based suggestions (top category share, month-over-month spikes, savings
  rate, recurring subscriptions).
- **Transactions** (`/transactions`): browse and manually re-categorize any
  transaction; filter by category.

## Notes

- Only CSV statements are supported today; PDF statement parsing isn't implemented.
- Categorization is keyword-based (`src/lib/categories.ts`) — extend the keyword
  lists there for merchants it misses.
- No de-duplication yet: re-uploading the same statement will import duplicate rows.
