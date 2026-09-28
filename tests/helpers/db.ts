// Seeding helpers for tests that need rows in the (throwaway) database.
// tests/setup.ts has already pointed SPENDWISE_DATA_DIR at a temp directory, so
// getDb() here opens a fresh, empty database for the current test file.
import { getDb } from "@/lib/db";
import { transactionHash } from "@/lib/dedupe";

export interface SeedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = money out (the app's convention)
  category: string;
  institution?: string | null;
}

export function seedStatement(filename = "synthetic.csv", institution: string | null = null): number {
  const result = getDb()
    .prepare("INSERT INTO statements (filename, institution) VALUES (?, ?)")
    .run(filename, institution);
  return Number(result.lastInsertRowid);
}

export function seedTransactions(statementId: number, rows: SeedTransaction[]): void {
  const insert = getDb().prepare(
    `INSERT INTO transactions (statement_id, date, description, amount, category, hash, institution)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    insert.run(statementId, r.date, r.description, r.amount, r.category,
      transactionHash(r.date, r.description, r.amount), r.institution ?? null);
  }
  getDb().prepare("UPDATE statements SET transaction_count = transaction_count + ? WHERE id = ?")
    .run(rows.length, statementId);
}

// Convenience: n monthly charges for one merchant, ending on `lastDate`.
export function monthlySeries(description: string, amount: number, category: string, lastDate: string, n: number): SeedTransaction[] {
  const [y, m, d] = lastDate.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - (n - 1 - i), d));
    return { date: date.toISOString().slice(0, 10), description, amount, category };
  });
}
