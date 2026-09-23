# Direct bank connections (Plaid)

SpendWise can connect to a bank account directly via [Plaid](https://plaid.com)
instead of (or alongside) uploading a CSV/PDF statement — transactions sync in
automatically and flow through the exact same categorization and analytics
pipeline as an uploaded statement. This is gated behind the `bankSync`
[feature flag](workflow.md#feature-flags) and is off by default.

## This changes the app's privacy story — read this first

Until now, zero data has ever left the machine SpendWise runs on. Connecting
a bank via Plaid necessarily changes that for the accounts you choose to
connect: transaction data passes through Plaid's servers to reach this app.
Nothing about the CSV/PDF upload flow changes — it's still fully local — but
`bankSync` is an explicit, opt-in exception to "nothing leaves your machine,"
not a replacement for it.

## Sandbox vs. Production

This app is built and should be verified against Plaid's **Sandbox**
environment: fake institutions, fake transactions, genuinely free, no real
bank credentials involved. **Production access (real banks) is a separate
decision** — it needs your own Plaid account and whatever Plaid's current
pricing/free-tier terms are at the time, which change and aren't something
to take on faith from this doc. Check
[plaid.com/pricing](https://plaid.com/pricing) yourself before flipping
`PLAID_ENV` to `production`.

## Setup (Sandbox)

1. Create a free account at
   [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the dashboard, go to **Team Settings → Keys** and copy your
   `client_id` and **Sandbox** `secret`.
3. Add to `.env.local` (already gitignored):
   ```
   PLAID_CLIENT_ID=...
   PLAID_SECRET=...
   PLAID_ENV=sandbox
   FEATURE_BANK_SYNC=true
   ```
4. `npm run dev`, go to the new **Accounts** nav item, click **Connect a
   bank**. In Plaid's Sandbox Link flow, search for a test institution (e.g.
   "Platypus Bank") and log in with Plaid's documented Sandbox credentials —
   username `user_good`, password `pass_good` (see
   [Plaid's Sandbox docs](https://plaid.com/docs/sandbox/) for the current
   list of test institutions/credentials).

## Architecture

```
src/lib/plaidClient.ts   Constructs the official PlaidApi client from
                          PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV.
src/lib/secretBox.ts     AES-256-GCM encrypt/decrypt for the access token.
src/lib/plaidSync.ts     syncPlaidItem() and revokePlaidAccessForStatement().
src/app/api/plaid/       link-token, exchange, items, sync/[itemId] routes.
src/components/          PlaidConnectButton, ConnectedAccountsList,
                          AccountsPageContent.
src/app/accounts/        The /accounts page (server-gated by the flag).
```

A connected bank is modeled as a `statements` row with `source = 'plaid'`
(see [docs/database-schema.md](database-schema.md)) rather than a new
parallel concept — a live Plaid connection is, conceptually, "a
continuously-refilled batch of transactions from one source," which is what
a statement already represents. This means the existing statement-delete
cascade, institution field, and transaction count all apply to a connected
bank for free: deleting the statement disconnects it and removes its
transactions, which is exactly the right behavior for "disconnect."

### Token encryption

A Plaid access token is a long-lived credential that can keep pulling an
account's transactions until revoked — it can't sit in plaintext next to the
transaction data. This app encrypts it with a random AES-256-GCM key
generated on first use and stored in its own file (`plaid.key`, mode `0600`)
in the same app-data directory as the database (`src/lib/secretBox.ts`).

This is **app-level encryption, not the OS keychain**, and that's a
deliberate tradeoff, not an oversight: Electron's `safeStorage` (macOS
Keychain / Windows DPAPI) would give real OS-level protection, but only from
Electron's *main* process — this app's Next.js server runs as a separate
spawned child process (`ELECTRON_RUN_AS_NODE=1`, see
[electron/main.ts](../electron/main.ts)) with no access to it, and
`safeStorage` wouldn't help `npm run dev` at all anyway (no packaged app, no
keychain to call). The key-file approach is weaker — anything that can read
your user account's files can read both the key and the database — but is a
real improvement over plaintext, needs no cross-process bridge, and works
identically in dev and packaged mode. OS-keychain integration remains a
possible future hardening step for the packaged app specifically, not built
here.

### Sign convention

**Plaid's amount sign is the opposite of this app's.** Plaid: positive =
money out (an expense). This app (matching a checking account's CSV export):
negative = money out. `plaidSync.ts` flips the sign on every synced
transaction (`amount: -plaidTransaction.amount`). Getting this backwards
silently inverts income and expenses app-wide — exactly the class of bug
already hit once with a CSV import (see database-schema.md's "Known
issues") — so this flip is deliberate and should be the first thing checked
if a connected account's totals look inverted.

### Sync model: manual + best-effort on load, not real-time

There's no webhook receiver — a local desktop app has no public server for
Plaid to push updates to. Syncing happens via a manual "Sync now" button per
connected account, and best-effort automatically when the Accounts page
loads. This matches what banks actually do anyway (batch updates, not
instant-on-swipe), discussed with the user before this was built.

### Incremental sync and dedup

`syncPlaidItem()` calls Plaid's `/transactions/sync` with a stored cursor,
which returns **added / modified / removed** changesets rather than a full
transaction list — necessary because a "pending" transaction is later
replaced by a "posted" one with a different `transaction_id`, which a naive
full re-fetch would either duplicate or miss. `plaid_transaction_id` (unique
when set) is the primary key for applying these changesets correctly; the
existing content hash is still computed for every synced row too, as a
safety net in case the same transaction also arrives via a manually uploaded
CSV for the same account.

### Categorization

Plaid-sourced transactions go through the exact same
[`categorizeTransaction()`](../src/lib/categorizeTransaction.ts) pipeline as
an uploaded statement (keyword → merchant cache → LLM → fallback) — not
Plaid's own category taxonomy — so the dashboard has one consistent category
system regardless of where a transaction came from. A manual category
correction (`category_locked = 1`) is respected on every future sync: a
re-sync of a modified transaction skips re-categorizing it.

## Explicitly out of scope (for now)

- Production/real-bank access — a later, separate decision (see above).
- Webhooks / true real-time sync.
- OS-keychain token encryption.
- Surfacing Plaid's own balance or category-taxonomy data in the dashboard
  beyond what already feeds the existing transaction pipeline.

## Verifying a change here

1. `npm run typecheck && npm run lint && npm run build`.
2. With Sandbox env vars set, connect a Sandbox test institution, confirm
   transactions land with the correct sign and category, and that the
   Dashboard reflects them with no changes needed there (same analytics
   path as an upload).
3. Sync twice — confirm no duplicate rows.
4. Manually correct a category on a synced transaction, sync again, confirm
   the correction survives.
5. Disconnect — confirm the item is removed at Plaid (check the Plaid
   dashboard's Sandbox item list) and the local rows are gone.
