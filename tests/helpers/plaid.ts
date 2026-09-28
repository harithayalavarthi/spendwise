// Synthetic Plaid building blocks for tests. Everything here is fake:
// Sandbox-style ids ("txn_sbx_…", "access-sandbox-…"), invented merchants.
// Tests mock "@/lib/plaidClient" so no real Plaid call is ever made.
import type { Transaction as PlaidTransaction, TransactionsSyncResponse } from "plaid";
import { getDb } from "@/lib/db";
import { encrypt } from "@/lib/secretBox";

export const FAKE_ACCESS_TOKEN = "access-sandbox-00000000-0000-4000-8000-000000000000";

export interface SyncPage {
  added?: Array<Partial<PlaidTransaction>>;
  modified?: Array<Partial<PlaidTransaction>>;
  removed?: string[];
  next_cursor: string;
  has_more?: boolean;
}

// Only the fields plaidSync.ts reads matter; the rest of Plaid's large
// Transaction type is irrelevant here, so the cast is deliberate.
export function plaidTxn(fields: Partial<PlaidTransaction> & { transaction_id: string }): PlaidTransaction {
  return {
    account_id: "acct_sbx_checking_0001",
    date: "2026-09-01",
    name: "SYNTHETIC MERCHANT",
    merchant_name: null,
    amount: 1,
    pending: false,
    pending_transaction_id: null,
    ...fields,
  } as PlaidTransaction;
}

export function syncResponse(page: SyncPage): { data: TransactionsSyncResponse } {
  return {
    data: {
      added: (page.added ?? []).map((t) => plaidTxn(t as PlaidTransaction)),
      modified: (page.modified ?? []).map((t) => plaidTxn(t as PlaidTransaction)),
      removed: (page.removed ?? []).map((transaction_id) => ({ transaction_id })),
      next_cursor: page.next_cursor,
      has_more: page.has_more ?? false,
    } as unknown as TransactionsSyncResponse,
  };
}

// A connected bank = a `source = 'plaid'` statement + its plaid_items row.
export function seedPlaidItem(opts: { itemId?: string; institution?: string; cursor?: string | null } = {}): {
  statementId: number;
  plaidItemId: number;
} {
  const db = getDb();
  const statementId = Number(
    db
      .prepare(`INSERT INTO statements (filename, institution, source) VALUES (?, ?, 'plaid')`)
      .run("Platypus Bank (Plaid)", opts.institution ?? "Platypus Bank").lastInsertRowid,
  );
  const plaidItemId = Number(
    db
      .prepare(`INSERT INTO plaid_items (item_id, statement_id, access_token_encrypted, cursor) VALUES (?, ?, ?, ?)`)
      .run(opts.itemId ?? "item_sbx_0001", statementId, encrypt(FAKE_ACCESS_TOKEN), opts.cursor ?? null)
      .lastInsertRowid,
  );
  return { statementId, plaidItemId };
}

export interface StoredRow {
  plaid_transaction_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  category_locked: number;
  institution: string | null;
  statement_id: number;
}

export function storedRows(): StoredRow[] {
  return getDb()
    .prepare(
      `SELECT plaid_transaction_id, date, description, amount, category, category_locked, institution, statement_id
       FROM transactions ORDER BY plaid_transaction_id`,
    )
    .all() as StoredRow[];
}

export function resetDb(): void {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM plaid_items; DELETE FROM statements; DELETE FROM merchant_categories;`);
}
