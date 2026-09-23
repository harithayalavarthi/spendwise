import { getPlaidClient } from "./plaidClient";
import { getDb } from "./db";
import { decrypt } from "./secretBox";
import { categorizeTransaction } from "./categorizeTransaction";
import { transactionHash } from "./dedupe";
import { logInfo, logWarn } from "./logger";
import type { Transaction as PlaidTransaction } from "plaid";

interface PlaidItemRow {
  id: number;
  item_id: string;
  statement_id: number;
  access_token_encrypted: string;
  cursor: string | null;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

// Plaid's /transactions/sync returns added/modified/removed changesets since
// the last cursor — a "pending" transaction is later replaced by a "posted"
// one with a different id, which is why this can't just insert everything
// as new rows the way a CSV/PDF upload does. See docs/plaid-bank-sync.md.
export async function syncPlaidItem(plaidItemDbId: number): Promise<SyncResult> {
  const db = getDb();
  const item = db
    .prepare(`SELECT id, item_id, statement_id, access_token_encrypted, cursor FROM plaid_items WHERE id = ?`)
    .get(plaidItemDbId) as PlaidItemRow | undefined;
  if (!item) throw new Error(`No plaid_items row with id ${plaidItemDbId}`);

  const statement = db.prepare(`SELECT institution FROM statements WHERE id = ?`).get(item.statement_id) as
    | { institution: string | null }
    | undefined;
  const institution = statement?.institution ?? null;

  const accessToken = decrypt(item.access_token_encrypted);
  const client = getPlaidClient();

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: string[] = [];
  let cursor = item.cursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({ access_token: accessToken, cursor });
    added.push(...response.data.added);
    modified.push(...response.data.modified);
    removed.push(...response.data.removed.map((r) => r.transaction_id));
    hasMore = response.data.has_more;
    cursor = response.data.next_cursor;
  }

  logInfo(
    "plaid-sync",
    `Item ${item.item_id}: ${added.length} added, ${modified.length} modified, ${removed.length} removed`
  );

  const existingLocked = db.prepare(
    `SELECT plaid_transaction_id FROM transactions WHERE plaid_transaction_id IS NOT NULL AND category_locked = 1`
  );
  const lockedIds = new Set((existingLocked.all() as Array<{ plaid_transaction_id: string }>).map((r) => r.plaid_transaction_id));

  const insert = db.prepare(
    `INSERT INTO transactions (statement_id, date, description, amount, category, hash, institution, plaid_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateWithCategory = db.prepare(
    `UPDATE transactions SET date = ?, description = ?, amount = ?, category = ?, hash = ?
     WHERE plaid_transaction_id = ?`
  );
  const updateWithoutCategory = db.prepare(
    `UPDATE transactions SET date = ?, description = ?, amount = ?, hash = ?
     WHERE plaid_transaction_id = ?`
  );
  const remove = db.prepare(`DELETE FROM transactions WHERE plaid_transaction_id = ?`);

  // categorizeTransaction can call the local LLM (async I/O), which
  // better-sqlite3's synchronous transactions can't wrap — resolve every
  // category first, then write everything in one fast sync transaction,
  // the same pattern as the upload route.
  const toInsert: Array<{ p: PlaidTransaction; date: string; description: string; amount: number; category: string; hash: string }> = [];
  for (const p of [...added, ...modified]) {
    const date = p.date;
    const description = p.merchant_name || p.name;
    // Plaid: positive amount = money out (expense). This app: negative =
    // expense, positive = income — opposite conventions. Getting this
    // backwards silently inverts income and expenses, exactly the class of
    // bug already hit once with a CSV import (see docs/database-schema.md's
    // "Known issues") — this flip is deliberate and tested, not assumed.
    const amount = -p.amount;
    const hash = transactionHash(date, description, amount);

    if (lockedIds.has(p.transaction_id)) {
      // User already corrected this one — keep their category, just refresh
      // the other fields in case Plaid revised the pending->posted details.
      updateWithoutCategory.run(date, description, amount, hash, p.transaction_id);
      continue;
    }
    const { category } = await categorizeTransaction(description, amount);
    toInsert.push({ p, date, description, amount, category, hash });
  }

  const write = db.transaction(() => {
    for (const t of toInsert) {
      const isModified = modified.some((m) => m.transaction_id === t.p.transaction_id);
      if (isModified) {
        updateWithCategory.run(t.date, t.description, t.amount, t.category, t.hash, t.p.transaction_id);
      } else {
        insert.run(item.statement_id, t.date, t.description, t.amount, t.category, t.hash, institution, t.p.transaction_id);
      }
    }
    for (const id of removed) {
      remove.run(id);
    }
    db.prepare(`UPDATE plaid_items SET cursor = ?, last_synced_at = datetime('now') WHERE id = ?`).run(cursor, item.id);
    db.prepare(
      `UPDATE statements SET transaction_count = (SELECT COUNT(*) FROM transactions WHERE statement_id = ?) WHERE id = ?`
    ).run(item.statement_id, item.statement_id);
  });
  write();

  if (added.length === 0 && modified.length === 0 && removed.length === 0) {
    logInfo("plaid-sync", `Item ${item.item_id}: no changes`);
  }

  return { added: added.length, modified: modified.length, removed: removed.length };
}

// Called from DELETE /api/statements before it deletes the row — so
// disconnecting a Plaid-connected bank correctly revokes access at Plaid
// regardless of which UI path (the /accounts "Disconnect" button, or the
// generic "Delete" button already on the Upload page's StatementsList)
// triggered the deletion. A no-op for a statement that isn't Plaid-sourced.
export async function revokePlaidAccessForStatement(statementId: number): Promise<void> {
  const db = getDb();
  const item = db.prepare(`SELECT item_id, access_token_encrypted FROM plaid_items WHERE statement_id = ?`).get(
    statementId
  ) as { item_id: string; access_token_encrypted: string } | undefined;
  if (!item) return;

  try {
    const client = getPlaidClient();
    await client.itemRemove({ access_token: decrypt(item.access_token_encrypted) });
  } catch (err) {
    // Still let the caller delete local data even if Plaid's revoke call
    // fails (e.g. the item was already removed on Plaid's side) — log it
    // rather than leaving the user unable to disconnect from their own app.
    logWarn("plaid-sync", `itemRemove failed for ${item.item_id}, deleting local data anyway`, err);
  }
}
