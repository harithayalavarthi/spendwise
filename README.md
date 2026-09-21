# SpendWise

Upload bank statements (CSV or PDF), auto-categorize transactions, and get spending
analytics and suggestions to keep your finances on track. All data is stored locally
in a SQLite database — nothing leaves your machine.

## Download

Grab the latest build for your OS from this repo's
[**Releases**](../../releases/latest) page — `.dmg` for macOS, `.exe` for Windows.
No Node, no `npm install`, nothing else to set up; the local LLM (optional, for
smarter categorization) is offered as a guided one-time setup the first time you
run it. See [docs/packaging.md](docs/packaging.md) for how this is built and how
releases get published. **Both builds are currently unsigned** — see that doc's
[Code signing](docs/packaging.md#code-signing-not-done) section for what that
means when you open it.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- SQLite via `better-sqlite3` (file at `data/spendwise.db`, gitignored — schema documented in [docs/database-schema.md](docs/database-schema.md))
- `papaparse` for CSV parsing, `pdf-parse` for PDF text extraction, `recharts` for charts
- [Ollama](https://ollama.com) running a local LLM, as a categorization fallback (optional but recommended)
- Electron ([docs/packaging.md](docs/packaging.md)) for the packaged desktop app — the web app (`npm run dev`) and the desktop app are the same Next.js codebase, not a separate build

## Running from source

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then go to **Upload** and pick a
statement from your bank. (This is also how you'd build the desktop app yourself —
see [docs/packaging.md](docs/packaging.md#building-locally).)

### Local LLM categorization (optional)

Keyword matching alone leaves unfamiliar merchants in "Other." To have the app take a
best guess instead, install [Ollama](https://ollama.com) and pull the model this app
defaults to:

```bash
brew install ollama
brew services start ollama   # runs in the background, survives restarts
ollama pull qwen2.5:7b       # ~4.7 GB download, ~5 GB RAM while classifying
```

That's it — no code changes needed. If Ollama isn't running (or the model isn't pulled),
the app just silently falls back to the amount-sign default (Income/Other); nothing
breaks either way. Override the model or host with env vars if you want:

```bash
OLLAMA_MODEL=llama3.2:3b   # smaller/faster, noticeably less accurate on unfamiliar
                            # local merchants — see the categorization notes below
OLLAMA_HOST=http://localhost:11434
```

## How it works

- **Upload** (`/upload`): parses a CSV (auto-detects date/description/amount or
  debit+credit columns) or a PDF (heuristic line-based extraction — see caveat
  below), then categorizes each transaction (`src/lib/categorizeTransaction.ts`) in
  layers — keyword rules first (instant, free), then a merchant cache (a merchant
  the LLM or you have already resolved), then the local LLM (see below), then an
  amount-sign fallback (Income for a deposit, Other otherwise) if nothing else
  applies. Duplicate transactions (same date, description, and amount as one
  already stored) are detected via a content hash and skipped automatically, so
  re-uploading a statement — or a second export that overlaps by a few days — won't
  double-count anything.
- **Dashboard** (`/`): spending by category, income vs. expenses over time,
  monthly spending stacked by institution, a month explorer (pick a month, see
  its category and institution breakdown), highest-spend days and a
  day-of-week pattern, detected recurring payments (with missed-payment
  flagging), and rule-based suggestions (top category share, month-over-month
  spikes, savings rate, recurring subscriptions, missed recurring payments).
- **Transactions** (`/transactions`): browse and manually re-categorize any
  transaction; filter by category or by financial institution.

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
- Keyword matching (`src/lib/categories.ts`, punctuation-normalized so "WAL-MART"
  matches "walmart") is the first pass — extend the keyword lists there for
  merchants it should always catch for free, with no LLM call. The LLM only runs
  when keywords miss, i.e. it's a fallback, not a replacement.
- **The local LLM only ever sees the transaction description** — never amounts,
  dates, or account info — and it's sent to `localhost`, not the network. If
  Ollama isn't installed or running, categorization just falls back silently;
  nothing about the upload flow depends on it being available.
- The LLM is asked to answer "Other" rather than force a guess when a merchant
  name gives no real clue, and runs at `temperature: 0` for consistent,
  reproducible answers (a nonzero temperature made it invent a confident but
  wrong category for pure nonsense input during testing — worth knowing if you
  ever tune `src/lib/llmCategorize.ts`'s request options). It still gets some
  local/regional merchants wrong or answers "Other" — smaller models (e.g. the
  3B `llama3.2` variant) are noticeably worse at this than the default 7B model.
- Every LLM classification is cached by merchant (`merchant_categories` table) so
  the same merchant is never re-classified — a manual correction on the
  Transactions page updates that same cache and permanently overrides any future
  LLM guess for that merchant, on this and future imports.
- **Statement boilerplate is filtered out, not just miscategorized.** Balance
  snapshot / summary lines a statement prints alongside real transactions —
  "Opening Balance", "Closing Balance", "Previous Balance", "Total", etc. — have
  the same date-plus-amount shape as a real transaction, so a heuristic parser
  can mistake one for the other. These are recognized and dropped before they're
  ever inserted (`src/lib/statementNoise.ts`), not filtered out later on the
  dashboard, so a row that shows up in Transactions is always a real one.
- **Recurring payment detection** (`src/lib/recurringPayments.ts`) groups
  expenses by merchant, and flags a merchant as recurring if it has 3+ charges
  at a consistent cadence (weekly/biweekly/monthly/quarterly/yearly, within a
  tolerance) and a consistent amount (within 20%, or $3 for small charges).
  "Missed" status compares the expected next charge date against the most
  recent expense date anywhere in your data (not today's real calendar date —
  your data's own currency is what matters), with a grace window scaled to
  the cadence. It's a pattern match on 3+ data points, not a guarantee —
  always check a flagged merchant against the real account before assuming
  anything.
- **Financial institution**: on upload, the app first tries to auto-detect the
  bank/card issuer from the statement's own text (`src/lib/detectInstitution.ts`
  — a curated list of common bank names, not a general classifier); typing a
  value into the optional field on the Upload page always overrides whatever
  would've been detected. Either way it's stored on every transaction from that
  statement, so you can filter the Transactions page by institution for
  FI-level analysis. If neither finds one, it's left unset — click the
  "+ institution" badge on the Statements list (Upload page) to set or correct
  it at any time; the change cascades to every transaction under that
  statement immediately.
