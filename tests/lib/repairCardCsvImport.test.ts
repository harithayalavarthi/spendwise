// The one-off BUG-1/BUG-16 repair: rebuilds card-CSV statements imported with
// the old parser, keeping the user's manual categories.
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { applyCardCsvRepair, planCardCsvRepair } from "@/lib/repairCardCsvImport";
import { readCsvFixture } from "../helpers/csv";
import { seedStatement, seedTransactions } from "../helpers/db";

const csv = readCsvFixture("csv-card-export.csv");

// What the pre-fix importer stored for csv-card-export.csv: Merchant Category as
// the description, charges positive, the refund negative, and the card payment
// (blank Merchant Category) dropped.
function seedBrokenImport(): number {
  const id = seedStatement("Transaction History_2026-06-10.csv", "Scotia Bank");
  seedTransactions(id, [
    { date: "2026-06-02", description: "Grocery Stores and Supermarkets", amount: 54.2, category: "Groceries" },
    { date: "2026-06-03", description: "Eating Places and Restaurants", amount: 4.75, category: "Dining & Coffee" },
    { date: "2026-06-07", description: "Book Stores", amount: -18.99, category: "Shopping" },
    { date: "2026-06-09", description: "Cable, Satellite, and Other Pay Television and Radio Services", amount: 112.31, category: "Utilities & Bills" },
  ]);
  // The user had corrected the cable row by hand.
  getDb().prepare(`UPDATE transactions SET category_locked = 1 WHERE statement_id = ? AND date = '2026-06-09'`).run(id);
  return id;
}

function rows(statementId: number) {
  return getDb()
    .prepare(`SELECT date, description, amount, category, category_locked FROM transactions WHERE statement_id = ? ORDER BY date`)
    .all(statementId) as Array<{ date: string; description: string; amount: number; category: string; category_locked: number }>;
}

describe("repairCardCsvImport (BUG-1, BUG-16)", () => {
  beforeEach(() => {
    getDb().exec(`DELETE FROM transactions; DELETE FROM statements;`);
  });

  it("plans the fix without changing anything", () => {
    const id = seedBrokenImport();
    const [plan] = planCardCsvRepair(getDb(), [{ statementId: id, csvText: csv }]);

    expect(plan.oldCount).toBe(4);
    expect(plan.newRows.map((r) => [r.description, r.amount])).toEqual([
      ["WOODGROVE MARKET #12", -54.2],
      ["FOURTH COFFEE", -4.75],
      ["PRE-AUTHORIZED PAYMENT", 1250],
      ["LITWARE BOOKS", 18.99],
      ["CONTOSO CABLE", -112.31],
    ]);
    expect(plan.carried).toEqual([{ date: "2026-06-09", amount: -112.31, category: "Utilities & Bills" }]);
    expect(plan.unmatchedLocked).toEqual([]);
    // Before: charges counted as income. After: they're expenses; the payment is a transfer.
    expect(plan.before).toEqual({ income: 171.26, expense: 18.99, transfers: 0 });
    expect(plan.after).toEqual({ income: 18.99, expense: 171.26, transfers: 1250 });
    // Read-only: the stored rows are untouched.
    expect(rows(id).map((r) => r.description)[0]).toBe("Grocery Stores and Supermarkets");
  });

  it("replaces the rows, keeps the manual category locked, and fixes the count", async () => {
    const id = seedBrokenImport();
    await applyCardCsvRepair(getDb(), planCardCsvRepair(getDb(), [{ statementId: id, csvText: csv }]));

    const after = rows(id);
    expect(after).toHaveLength(5);
    expect(after.find((r) => r.description === "CONTOSO CABLE")).toMatchObject({
      amount: -112.31,
      category: "Utilities & Bills",
      category_locked: 1,
    });
    expect(after.find((r) => r.description === "PRE-AUTHORIZED PAYMENT")).toMatchObject({ amount: 1250, category: "Transfers" });
    expect(after.filter((r) => r.category_locked === 1)).toHaveLength(1);
    expect(getDb().prepare(`SELECT transaction_count FROM statements WHERE id = ?`).get(id)).toEqual({ transaction_count: 5 });
  });

  it("reports a manual category it can't match instead of guessing", () => {
    const id = seedBrokenImport();
    getDb()
      .prepare(`INSERT INTO transactions (statement_id, date, description, amount, category, category_locked) VALUES (?, '2026-06-20', 'Unknown Category', 9.99, 'Health & Wellness', 1)`)
      .run(id);
    const [plan] = planCardCsvRepair(getDb(), [{ statementId: id, csvText: csv }]);
    expect(plan.unmatchedLocked).toEqual([{ date: "2026-06-20", amount: 9.99, category: "Health & Wellness" }]);
  });

  it("leaves other statements alone and skips rows they already contain", async () => {
    const id = seedBrokenImport();
    const other = seedStatement("other.csv");
    seedTransactions(other, [{ date: "2026-06-03", description: "FOURTH COFFEE", amount: -4.75, category: "Dining & Coffee" }]);

    const [plan] = planCardCsvRepair(getDb(), [{ statementId: id, csvText: csv }]);
    expect(plan.duplicatesElsewhere).toBe(1);
    await applyCardCsvRepair(getDb(), [plan]);

    expect(rows(id)).toHaveLength(4);
    expect(rows(other)).toEqual([
      { date: "2026-06-03", description: "FOURTH COFFEE", amount: -4.75, category: "Dining & Coffee", category_locked: 0 },
    ]);
  });
});
