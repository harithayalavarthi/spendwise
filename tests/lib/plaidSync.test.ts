// Plaid bank sync (BANK-2, BANK-3, BANK-6). Plaid itself is always faked:
// "@/lib/plaidClient" is mocked, so getPlaidClient() returns a stub whose
// transactionsSync/itemRemove responses each test scripts. Categorization is
// the real pipeline; the local LLM (fetch) is stubbed where a merchant misses
// the keyword rules.
import util from "node:util";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { revokePlaidAccessForStatement, syncPlaidItem } from "@/lib/plaidSync";
import { DELETE as deleteStatement } from "@/app/api/statements/route";
import initialPage from "../fixtures/plaid-sync-initial.json";
import {
  FAKE_ACCESS_TOKEN,
  resetDb,
  seedPlaidItem,
  storedRows,
  syncResponse,
  type SyncPage,
} from "../helpers/plaid";

const fakePlaid = vi.hoisted(() => ({
  transactionsSync: vi.fn(),
  itemRemove: vi.fn(),
}));

vi.mock("@/lib/plaidClient", () => ({
  getPlaidClient: () => fakePlaid,
}));

// Queue one /transactions/sync response per call, in order.
function queueSyncPages(...pages: SyncPage[]) {
  for (const page of pages) fakePlaid.transactionsSync.mockResolvedValueOnce(syncResponse(page));
}

// Local LLM stub: always answers `category`, and records what it was sent.
function stubLlm(category: string) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ message: { content: JSON.stringify({ category }) } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function cursorOf(plaidItemId: number): string | null {
  return (getDb().prepare(`SELECT cursor FROM plaid_items WHERE id = ?`).get(plaidItemId) as { cursor: string | null })
    .cursor;
}

function transactionCount(statementId: number): number {
  return (
    getDb().prepare(`SELECT transaction_count FROM statements WHERE id = ?`).get(statementId) as {
      transaction_count: number;
    }
  ).transaction_count;
}

beforeEach(() => {
  resetDb();
  fakePlaid.transactionsSync.mockReset();
  fakePlaid.itemRemove.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  expect(fakePlaid.transactionsSync.mock.calls.every(([req]) => req.access_token === FAKE_ACCESS_TOKEN)).toBe(true);
});

describe("syncPlaidItem — sign convention (BANK-2)", () => {
  it("flips Plaid's sign: money out is stored negative, deposits and refunds positive", async () => {
    // Fixture imitates a Plaid Sandbox checking account's first sync page.
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(initialPage as SyncPage);

    await syncPlaidItem(plaidItemId);

    const byId = Object.fromEntries(storedRows().map((r) => [r.plaid_transaction_id, r]));
    expect(byId.txn_sbx_coffee_0001.amount).toBe(-4.75); // Plaid +4.75 = purchase
    expect(byId.txn_sbx_payroll_0001.amount).toBe(2500); // Plaid -2500 = deposit
    expect(byId.txn_sbx_refund_0001.amount).toBe(19.99); // Plaid -19.99 = refund/credit
  });

  it("uses merchant_name when present, else the raw name, and copies the statement's institution", async () => {
    const { plaidItemId, statementId } = seedPlaidItem({ institution: "Platypus Bank" });
    queueSyncPages(initialPage as SyncPage);

    await syncPlaidItem(plaidItemId);

    const byId = Object.fromEntries(storedRows().map((r) => [r.plaid_transaction_id, r]));
    expect(byId.txn_sbx_coffee_0001.description).toBe("Starbucks");
    expect(byId.txn_sbx_payroll_0001.description).toBe("PLATYPUS PAYROLL DIRECT DEP");
    expect(byId.txn_sbx_coffee_0001.date).toBe("2026-09-01");
    for (const row of storedRows()) {
      expect(row.institution).toBe("Platypus Bank");
      expect(row.statement_id).toBe(statementId);
    }
  });
});

describe("syncPlaidItem — incremental /transactions/sync (BANK-2)", () => {
  it("sends no cursor on the first sync, stores next_cursor, and reuses it next time", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_a", amount: 10 }], next_cursor: "cursor_1" },
      { next_cursor: "cursor_2" },
    );

    await syncPlaidItem(plaidItemId);
    expect(fakePlaid.transactionsSync).toHaveBeenLastCalledWith({ access_token: FAKE_ACCESS_TOKEN, cursor: undefined });
    expect(cursorOf(plaidItemId)).toBe("cursor_1");

    await syncPlaidItem(plaidItemId);
    expect(fakePlaid.transactionsSync).toHaveBeenLastCalledWith({ access_token: FAKE_ACCESS_TOKEN, cursor: "cursor_1" });
    expect(cursorOf(plaidItemId)).toBe("cursor_2");
  });

  it("records last_synced_at", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages({ next_cursor: "cursor_1" });
    await syncPlaidItem(plaidItemId);
    const row = getDb().prepare(`SELECT last_synced_at FROM plaid_items WHERE id = ?`).get(plaidItemId) as {
      last_synced_at: string | null;
    };
    expect(row.last_synced_at).not.toBeNull();
  });

  it("follows has_more across pages, passing each page's cursor, and stores only the final one", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_p1", amount: 1 }], next_cursor: "cursor_p1", has_more: true },
      { added: [{ transaction_id: "txn_sbx_p2", amount: 2 }], next_cursor: "cursor_p2", has_more: true },
      { added: [{ transaction_id: "txn_sbx_p3", amount: 3 }], next_cursor: "cursor_p3", has_more: false },
    );

    const result = await syncPlaidItem(plaidItemId);

    expect(result).toEqual({ added: 3, modified: 0, removed: 0 });
    expect(fakePlaid.transactionsSync.mock.calls.map(([req]) => req.cursor)).toEqual([
      undefined,
      "cursor_p1",
      "cursor_p2",
    ]);
    expect(storedRows().map((r) => r.plaid_transaction_id)).toEqual(["txn_sbx_p1", "txn_sbx_p2", "txn_sbx_p3"]);
    expect(cursorOf(plaidItemId)).toBe("cursor_p3");
  });

  it("updates a modified transaction in place instead of adding a row", async () => {
    const { plaidItemId, statementId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_m", name: "STARBUCKS 0421", amount: 4.75, date: "2026-09-01" }], next_cursor: "c1" },
      { modified: [{ transaction_id: "txn_sbx_m", name: "STARBUCKS 0421", amount: 5.25, date: "2026-09-02" }], next_cursor: "c2" },
    );

    await syncPlaidItem(plaidItemId);
    const result = await syncPlaidItem(plaidItemId);

    expect(result).toEqual({ added: 0, modified: 1, removed: 0 });
    const rows = storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plaid_transaction_id: "txn_sbx_m", amount: -5.25, date: "2026-09-02" });
    expect(transactionCount(statementId)).toBe(1);
  });

  it("deletes removed transactions and keeps the statement's transaction_count in step", async () => {
    const { plaidItemId, statementId } = seedPlaidItem();
    queueSyncPages(
      {
        added: [
          { transaction_id: "txn_sbx_keep", amount: 1 },
          { transaction_id: "txn_sbx_gone", amount: 2 },
        ],
        next_cursor: "c1",
      },
      { removed: ["txn_sbx_gone"], next_cursor: "c2" },
    );

    await syncPlaidItem(plaidItemId);
    expect(transactionCount(statementId)).toBe(2);
    const result = await syncPlaidItem(plaidItemId);

    expect(result).toEqual({ added: 0, modified: 0, removed: 1 });
    expect(storedRows().map((r) => r.plaid_transaction_id)).toEqual(["txn_sbx_keep"]);
    expect(transactionCount(statementId)).toBe(1);
  });

  it("replaces a pending transaction with its posted version without duplicating it", async () => {
    const { plaidItemId, statementId } = seedPlaidItem();
    queueSyncPages(
      {
        added: [{ transaction_id: "txn_sbx_pending", name: "STARBUCKS 0421", amount: 4.75, pending: true }],
        next_cursor: "c1",
      },
      // Plaid's shape for pending -> posted: the pending id is removed and a
      // new id is added, pointing back at it via pending_transaction_id.
      {
        added: [
          {
            transaction_id: "txn_sbx_posted",
            pending_transaction_id: "txn_sbx_pending",
            name: "STARBUCKS 0421",
            amount: 5.75, // tip added when it posted
            pending: false,
          },
        ],
        removed: ["txn_sbx_pending"],
        next_cursor: "c2",
      },
    );

    await syncPlaidItem(plaidItemId);
    await syncPlaidItem(plaidItemId);

    const rows = storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plaid_transaction_id: "txn_sbx_posted", amount: -5.75 });
    expect(transactionCount(statementId)).toBe(1);
  });

  it("an empty re-sync changes nothing and adds no duplicates", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(initialPage as SyncPage, { next_cursor: "cursor_sbx_page_2" });

    await syncPlaidItem(plaidItemId);
    const before = storedRows();
    const result = await syncPlaidItem(plaidItemId);

    expect(result).toEqual({ added: 0, modified: 0, removed: 0 });
    expect(storedRows()).toEqual(before);
  });

  it("never stores two rows for one plaid_transaction_id; a re-delivered 'added' id rejects the whole sync atomically", async () => {
    // Current behavior, documented: the partial unique index on
    // plaid_transaction_id makes a plain INSERT of an already-stored id throw,
    // and since every write happens in one db.transaction, nothing from that
    // sync (other rows, the cursor) is committed. No duplicate either way.
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_dup", amount: 3 }], next_cursor: "c1" },
      {
        added: [
          { transaction_id: "txn_sbx_new", amount: 7 },
          { transaction_id: "txn_sbx_dup", amount: 3 },
        ],
        next_cursor: "c2",
      },
    );

    await syncPlaidItem(plaidItemId);
    await expect(syncPlaidItem(plaidItemId)).rejects.toThrow(/UNIQUE/);

    expect(storedRows().map((r) => r.plaid_transaction_id)).toEqual(["txn_sbx_dup"]);
    expect(cursorOf(plaidItemId)).toBe("c1");
  });

  it("writes nothing and keeps the old cursor if a Plaid call fails mid-pagination", async () => {
    const { plaidItemId } = seedPlaidItem({ cursor: "c0" });
    fakePlaid.transactionsSync
      .mockResolvedValueOnce(
        syncResponse({ added: [{ transaction_id: "txn_sbx_p1", amount: 1 }], next_cursor: "c1", has_more: true }),
      )
      .mockRejectedValueOnce(new Error("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"));

    await expect(syncPlaidItem(plaidItemId)).rejects.toThrow(/MUTATION_DURING_PAGINATION/);
    expect(storedRows()).toEqual([]);
    expect(cursorOf(plaidItemId)).toBe("c0");
  });

  it("throws for an unknown plaid_items id without calling Plaid", async () => {
    await expect(syncPlaidItem(999)).rejects.toThrow(/No plaid_items row with id 999/);
    expect(fakePlaid.transactionsSync).not.toHaveBeenCalled();
  });
});

describe("syncPlaidItem — categorization (BANK-3)", () => {
  it("runs synced rows through the same keyword -> LLM -> fallback pipeline as uploads", async () => {
    const fetchMock = stubLlm("Shopping");
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages({
      added: [
        { transaction_id: "txn_sbx_kw", merchant_name: "Starbucks", amount: 4.75 },
        { transaction_id: "txn_sbx_pay", name: "PLATYPUS PAYROLL", amount: -2500 },
        { transaction_id: "txn_sbx_llm", name: "QUOKKA HARDWARE CO", amount: 42.1 },
      ],
      next_cursor: "c1",
    });

    await syncPlaidItem(plaidItemId);

    const byId = Object.fromEntries(storedRows().map((r) => [r.plaid_transaction_id, r]));
    expect(byId.txn_sbx_kw.category).toBe("Dining & Coffee");
    expect(byId.txn_sbx_pay.category).toBe("Income");
    expect(byId.txn_sbx_llm.category).toBe("Shopping");
    // Only the keyword miss reaches the LLM, and it gets the description only
    // (privacy invariant: never an amount, date, or account info).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("QUOKKA HARDWARE CO");
    expect(body).not.toContain("42.1");
    expect(body).not.toContain("acct_sbx");
  });

  it("falls back on the (already flipped) sign when the LLM is unavailable", async () => {
    // fetch is left throwing (tests/setup.ts), so the LLM layer yields nothing.
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages({
      added: [
        { transaction_id: "txn_sbx_out", name: "ZZQX 7781", amount: 12 },
        { transaction_id: "txn_sbx_in", name: "ZZQY 7782", amount: -12 },
      ],
      next_cursor: "c1",
    });

    await syncPlaidItem(plaidItemId);

    const byId = Object.fromEntries(storedRows().map((r) => [r.plaid_transaction_id, r]));
    expect(byId.txn_sbx_out.category).toBe("Other");
    expect(byId.txn_sbx_in.category).toBe("Income");
  });

  it("keeps a locked manual category when the transaction is modified on re-sync", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_lock", name: "STARBUCKS 0421", amount: 4.75 }], next_cursor: "c1" },
      { modified: [{ transaction_id: "txn_sbx_lock", name: "STARBUCKS 0421", amount: 6.5, date: "2026-09-04" }], next_cursor: "c2" },
    );
    await syncPlaidItem(plaidItemId);
    // The user corrects it on the Transactions page (what that route writes).
    getDb()
      .prepare(`UPDATE transactions SET category = 'Entertainment', category_locked = 1 WHERE plaid_transaction_id = ?`)
      .run("txn_sbx_lock");

    await syncPlaidItem(plaidItemId);

    const [row] = storedRows();
    expect(row).toMatchObject({
      category: "Entertainment",
      category_locked: 1,
      amount: -6.5, // other fields still refresh
      date: "2026-09-04",
    });
  });

  it("re-categorizes an unlocked modified transaction", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_re", name: "ZZQX 7781", amount: 9 }], next_cursor: "c1" },
      { modified: [{ transaction_id: "txn_sbx_re", name: "STARBUCKS 0421", amount: 9 }], next_cursor: "c2" },
    );
    await syncPlaidItem(plaidItemId);
    expect(storedRows()[0].category).toBe("Other");

    await syncPlaidItem(plaidItemId);
    expect(storedRows()[0]).toMatchObject({ category: "Dining & Coffee", description: "STARBUCKS 0421" });
  });

  // BUG: a manual correction on a *pending* transaction is lost when it posts.
  // Plaid delivers pending -> posted as "remove the pending id, add a new id"
  // (with pending_transaction_id pointing back). plaidSync only checks locks
  // by the incoming transaction_id, so the posted row is re-categorized from
  // scratch and the locked pending row is deleted — BANK-3's "locked manual
  // corrections survive re-syncs" doesn't hold across posting. Flips to a
  // pass once the lock is carried over via pending_transaction_id.
  it.fails("carries a locked category from a pending transaction over to its posted replacement", async () => {
    const { plaidItemId } = seedPlaidItem();
    queueSyncPages(
      { added: [{ transaction_id: "txn_sbx_pend", name: "STARBUCKS 0421", amount: 4.75, pending: true }], next_cursor: "c1" },
      {
        added: [
          { transaction_id: "txn_sbx_post", pending_transaction_id: "txn_sbx_pend", name: "STARBUCKS 0421", amount: 4.75 },
        ],
        removed: ["txn_sbx_pend"],
        next_cursor: "c2",
      },
    );
    await syncPlaidItem(plaidItemId);
    getDb()
      .prepare(`UPDATE transactions SET category = 'Entertainment', category_locked = 1 WHERE plaid_transaction_id = ?`)
      .run("txn_sbx_pend");

    await syncPlaidItem(plaidItemId);

    const rows = storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plaid_transaction_id: "txn_sbx_post", category: "Entertainment", category_locked: 1 });
  });
});

describe("disconnect (BANK-6)", () => {
  it("revokePlaidAccessForStatement calls Plaid's itemRemove with the decrypted access token", async () => {
    const { statementId } = seedPlaidItem();
    fakePlaid.itemRemove.mockResolvedValueOnce({ data: { request_id: "req_sbx_1" } });

    await revokePlaidAccessForStatement(statementId);

    expect(fakePlaid.itemRemove).toHaveBeenCalledTimes(1);
    expect(fakePlaid.itemRemove).toHaveBeenCalledWith({ access_token: FAKE_ACCESS_TOKEN });
  });

  it("is a no-op for an uploaded (non-Plaid) statement", async () => {
    const id = Number(getDb().prepare(`INSERT INTO statements (filename) VALUES ('synthetic.csv')`).run().lastInsertRowid);
    await revokePlaidAccessForStatement(id);
    expect(fakePlaid.itemRemove).not.toHaveBeenCalled();
  });

  it("still resolves (and logs a warning) when Plaid's itemRemove fails", async () => {
    const { statementId } = seedPlaidItem();
    fakePlaid.itemRemove.mockRejectedValueOnce(new Error("ITEM_NOT_FOUND"));

    await expect(revokePlaidAccessForStatement(statementId)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("itemRemove failed for item_sbx_0001"), expect.anything());
  });

  it("DELETE /api/statements revokes at Plaid and removes the item and all its local transactions", async () => {
    const { plaidItemId, statementId } = seedPlaidItem();
    const other = seedPlaidItem({ itemId: "item_sbx_other" });
    queueSyncPages(initialPage as SyncPage, {
      added: [{ transaction_id: "txn_sbx_other_1", amount: 1 }],
      next_cursor: "o1",
    });
    await syncPlaidItem(plaidItemId);
    await syncPlaidItem(other.plaidItemId);
    fakePlaid.itemRemove.mockResolvedValueOnce({ data: { request_id: "req_sbx_2" } });

    const res = await deleteStatement(new NextRequest(`http://localhost/api/statements?id=${statementId}`, { method: "DELETE" }));

    expect(res.status).toBe(200);
    expect(fakePlaid.itemRemove).toHaveBeenCalledWith({ access_token: FAKE_ACCESS_TOKEN });
    const db = getDb();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE statement_id = ?`).get(statementId)).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM plaid_items WHERE statement_id = ?`).get(statementId)).toEqual({ n: 0 });
    // The other connected bank is untouched.
    expect(storedRows().map((r) => r.plaid_transaction_id)).toEqual(["txn_sbx_other_1"]);
  });

  // BUG-15 (fixed): the raw Axios error — whose `config.data` holds the
  // decrypted access token and `config.headers` the Plaid client id/secret —
  // used to be passed to logWarn. Now only Plaid's error code/message is logged.
  it("does not write the decrypted access token to the log when itemRemove fails", async () => {
    const { statementId } = seedPlaidItem();
    // Shaped like an AxiosError from the plaid client (fields it really has).
    const axiosLike = Object.assign(new Error("Request failed with status code 400"), {
      isAxiosError: true,
      config: {
        url: "https://sandbox.plaid.com/item/remove",
        data: JSON.stringify({ access_token: FAKE_ACCESS_TOKEN }),
        headers: { "PLAID-CLIENT-ID": "client_sbx_fake", "PLAID-SECRET": "secret_sbx_fake" },
      },
      response: { status: 400, data: { error_code: "ITEM_NOT_FOUND", error_message: "the Item was not found" } },
    });
    fakePlaid.itemRemove.mockRejectedValueOnce(axiosLike);

    await revokePlaidAccessForStatement(statementId);

    const logged = vi
      .mocked(console.warn)
      .mock.calls.map((args) => util.format(...args))
      .join("\n");
    expect(logged).toContain("itemRemove failed");
    expect(logged).toContain("ITEM_NOT_FOUND: the Item was not found"); // still useful for debugging
    expect(logged).not.toContain(FAKE_ACCESS_TOKEN);
    expect(logged).not.toContain("secret_sbx_fake");
    expect(logged).not.toContain("client_sbx_fake");
  });
});
