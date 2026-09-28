# SpendWise — Requirements

| | |
|---|---|
| **Status** | Draft — reverse-engineered from the app as of 2026-09-27 (`main` at 468ed53); awaiting owner review |
| **Owner** | Haritha Yalavarthi |
| **Related** | [decisions.md](decisions.md) · [roadmap.md](roadmap.md) · [docs/](../docs/) |

**Status legend:** **Built** — in the app today · **Partial** — works with known
gaps · **Open** — agreed or needed, not built · **Out of scope** — deliberately
not done for now.

## 1. Purpose

Upload bank and card statements (CSV or PDF), categorize transactions
automatically, and see where the money goes — with analytics and suggestions —
**without financial data leaving the machine** (except through explicit,
opt-in features). Primary user: the owner, with accounts in Canada and the US.

## 2. Functional requirements

### 2.1 Import (IMP)

| ID | Status | Requirement |
|---|---|---|
| IMP-1 | Built | Upload a **CSV** statement; auto-detect date, description, and amount columns, or separate debit/credit amount columns. |
| IMP-2 | Partial | Upload a **PDF** statement; heuristic line-by-line extraction (one or two leading dates with year inference from the statement period, amount found anywhere on the line, running balance detected and dropped). Scanned/image-only PDFs aren't supported. Always less reliable than CSV — spot-check against the statement. |
| IMP-3 | Built | **Credit-card detection** ("new balance", "minimum payment", "credit limit" wording) applies the card sign convention: an unsigned line is a charge; a payment/credit is a Transfer, not income. |
| IMP-4 | Built | **Statement boilerplate** (opening/closing/previous balance, totals, …) is recognized and dropped before insert (`statementNoise.ts`). |
| IMP-5 | Built | **Duplicate detection** by a hash of (date, description, amount): re-uploads and overlapping exports don't double-count. Known false positive: two genuinely identical same-day transactions — the second is skipped. |
| IMP-6 | Built | **Institution detection** from the statement text (curated bank list); a value typed on Upload always wins; editable later per statement, cascading to its transactions. |
| IMP-7 | Partial | **Sign correctness for every supported format.** Scotiabank CSVs store expenses as positive amounts — see BUG-1. |
| IMP-8 | Built | Delete a statement and all its transactions. |

### 2.2 Categorization (CAT)

| ID | Status | Requirement |
|---|---|---|
| CAT-1 | Built | **Layered categorization** at import: keyword rules → merchant cache → local LLM → amount-sign fallback (Income/Other). |
| CAT-2 | Built | The **local LLM** (Ollama, default `qwen2.5:7b`, `temperature: 0`) answers "Other" rather than guessing when a merchant gives no clue; if Ollama isn't running, import still works via the fallback. |
| CAT-3 | Built | Every LLM result is **cached per merchant**; the same merchant is never re-classified. |
| CAT-4 | Built | A **manual correction** on the Transactions page updates the transaction, locks its category, and overrides the merchant cache for all future imports. |

### 2.3 Analytics (DASH)

| ID | Status | Requirement |
|---|---|---|
| DASH-1 | Built | Spending by category; income vs. expenses over time; monthly spending stacked by institution. |
| DASH-2 | Built | Month explorer: pick a month, see its category and institution breakdown. |
| DASH-3 | Built | Highest-spend days and day-of-week pattern. |
| DASH-4 | Built | **Recurring payments**: 3+ charges at a consistent cadence (weekly → yearly) and amount (±20% or $3), with status on-track / due-soon / missed. "Missed" is relative to the latest date in the data, not today. |
| DASH-5 | Built | **Rule-based suggestions**: top-category share, month-over-month spikes, savings rate, subscriptions total, missed recurring payments. |
| DASH-6 | Built | **Transfers** are excluded from income, expense, and savings-rate totals everywhere. |
| DASH-7 | Open | **Currency per institution** (USD vs CAD). Today every amount is treated and shown as "$", so mixed US/Canadian accounts are summed as if one currency. Also needed for the Nudge link (INT-4). |

### 2.4 Transactions (TXN)

| ID | Status | Requirement |
|---|---|---|
| TXN-1 | Built | Browse all transactions; filter by category or institution; re-categorize any transaction (CAT-4). |

### 2.5 Direct bank connections (BANK) — behind the `bankSync` flag, off by default

Details: [docs/plaid-bank-sync.md](../docs/plaid-bank-sync.md).

| ID | Status | Requirement |
|---|---|---|
| BANK-1 | Built | Connect a bank via **Plaid** (Sandbox) on an Accounts page shown only when `FEATURE_BANK_SYNC=true`; a connection is modeled as a `statements` row with `source = 'plaid'`. |
| BANK-2 | Built | **Incremental sync** with Plaid's `/transactions/sync` cursor (added/modified/removed), keyed by `plaid_transaction_id`, plus the content hash as a safety net against CSV overlap. Plaid's sign is flipped to the app's convention. |
| BANK-3 | Built | Synced transactions use the same categorization pipeline (CAT-1); locked manual corrections survive re-syncs. |
| BANK-4 | Built | Sync is **manual ("Sync now") plus best-effort when the Accounts page loads** — no webhooks (a local app has no public endpoint). |
| BANK-5 | Built | Access tokens are **encrypted at rest** (AES-256-GCM, key in a `0600` file next to the database). |
| BANK-6 | Built | Disconnecting revokes the item at Plaid and deletes its local transactions. |
| BANK-7 | Out of scope | **Production (real banks)** — a separate decision needing a Plaid account and current pricing. |
| BANK-8 | Out of scope | Webhooks / real-time sync. |
| BANK-9 | Out of scope | OS-keychain token encryption (possible hardening for the packaged app). |
| BANK-10 | Open | **Retire or keep the flag.** Per [docs/workflow.md](../docs/workflow.md), once bank sync is fully shipped, remove the `bankSync` flag and its guards — or record why it stays as a permanent opt-in (it changes the privacy story, which argues for keeping it). |

### 2.6 Desktop app and releases (DESK)

Details: [docs/packaging.md](../docs/packaging.md).

| ID | Status | Requirement |
|---|---|---|
| DESK-1 | Built | One Next.js codebase runs as a web app (`npm run dev`) and as an **Electron desktop app**; macOS `.dmg` and Windows `.exe` published to GitHub Releases (the `cut-release` skill). |
| DESK-2 | Built | The packaged app keeps its database in the OS user-data folder (e.g. `~/Library/Application Support/SpendWise`), never in the build. |
| DESK-3 | Built | First-run guided setup for the optional local LLM. |
| DESK-4 | Open | **Code signing** (Apple Developer ID ~$99/yr; Windows certificate ~$100–400/yr). Builds are unsigned today, so Gatekeeper/SmartScreen warn. A business decision, not yet made. |

### 2.7 Nudge integration (INT) — for Nudge milestone M5

Source of truth: the Nudge spec (`harithayalavarthi/nudge`, `specs/product/requirements.md`
§6.8, design §11, ADR-009). SpendWise pushes **minimal signals** about recurring
payments to Nudge, which proposes TODOs; nothing else leaves the machine. All of
this sits behind a new SpendWise feature flag.

| ID | Status | Requirement |
|---|---|---|
| INT-1 | Open | **Stable IDs for suggestions** (today a suggestion is only title/detail/severity). |
| INT-2 | Open | **Per-merchant subscription detection** (today only a Subscriptions category total). |
| INT-3 | Open | **Price-increase detection** on recurring merchants (≥ 10%). |
| INT-4 | Open | Currency on every signal — depends on DASH-7. |
| INT-5 | Open | **Signal outbox + sync**: after import and on app start, compute signals, send only new/changed ones to Nudge over HTTPS with a revocable token, retry with backoff, and handle 400/401 (closed schema; token revoked). |
| INT-6 | Open | **Settings screen**: pair with a Nudge code, consent screen listing exactly which fields are sent, per-signal-type toggles, last-sync status, disconnect. Off until consented. |
| INT-7 | Open | **Privacy rules updated** in [docs/coding-standards.md](../docs/coding-standards.md) to document this outbound flow as an explicit, opt-in exception (as `bankSync` is). |
| INT-8 | Open | Recurring detection must see **all** expenses correctly — depends on BUG-1 (Scotiabank amounts are positive, so those bills are invisible to DASH-4). |

## 3. Open defects (BUG)

| ID | Severity | Defect |
|---|---|---|
| BUG-1 | High | **Scotiabank CSV expenses are stored as positive amounts.** All 67 transactions from the 3 `Transaction History_*.csv` statements count as income: income overstated, expenses understated, and these rows are invisible to category charts and recurring detection. Likely cause: a debit/credit *type* column the parser doesn't read. Flagged 2026-09-21 and deliberately left alone at the owner's request; fix before trusting totals or building INT. See [docs/database-schema.md](../docs/database-schema.md) "Known issues". |

## 4. Non-functional requirements

| ID | Status | Requirement |
|---|---|---|
| NFR-1 | Built | **Local-first:** all data in a local SQLite database; nothing leaves the machine by default. Opt-in exceptions are flagged and documented (`bankSync`; INT when built). |
| NFR-2 | Built | **LLM data minimization:** the local LLM only ever receives a transaction *description* — never amounts, dates, or account info — and only talks to `localhost`. |
| NFR-3 | Built | **No real data in builds:** `data/**` and `*.db*` are excluded from build output and verified after packaging changes. |
| NFR-4 | Built | **Test data never mixes into the real database;** manual test uploads are deleted with a before/after row count. |
| NFR-5 | Built | Server-side logging for the upload/categorization pipeline via `src/lib/logger.ts`. |
| NFR-6 | Open | **Automated tests.** There's no test suite (no Jest/Vitest); verification is `typecheck`, `lint`, `build`, and manual runs. Needed especially for parsing (every bank format and sign convention), duplicate detection, recurring detection, and INT. |
| NFR-7 | Open | **CI on pull requests** running typecheck, lint, build, and (once NFR-6 exists) tests — as Sift and Nudge now do. |

## 5. Open questions

| ID | Question | Working assumption |
|---|---|---|
| OQ-1 | Fix BUG-1 now, or keep it parked? | Parked at the owner's request; fix before INT (Nudge M5). |
| OQ-2 | Pursue Plaid Production (real banks)? | Not yet; needs a pricing check and a privacy decision. |
| OQ-3 | Sign the desktop builds? | No while the owner runs from source; revisit if others use the app. |
| OQ-4 | Keep `bankSync` as a permanent opt-in or remove the flag? | Keep — it guards a privacy change, not just a rollout. |
| OQ-5 | Test framework for NFR-6? | Vitest (fits the Next.js/TypeScript stack). |
