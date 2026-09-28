// Builders for the analytics tests (recurring payments, insights, monthly
// insights). All data is synthetic: invented merchants, 2026 dates.
import { getDb } from "@/lib/db";
import { seedStatement, seedTransactions, type SeedTransaction } from "./db";

// Analytics tests seed a different dataset per test, so each one starts from
// empty tables (the database itself is already a per-file throwaway).
export function resetDb(): void {
  getDb().exec("DELETE FROM transactions; DELETE FROM statements;");
}

export function seed(rows: SeedTransaction[]): void {
  seedTransactions(seedStatement(), rows);
}

export function tx(date: string, description: string, amount: number, category = "Other", institution: string | null = null): SeedTransaction {
  return { date, description, amount, category, institution };
}

// Adds `days` to a YYYY-MM-DD date (UTC, so no DST surprises).
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// One charge on `start`, then one after each gap: series("A", -10, "2026-01-01", [7, 7])
// gives three charges a week apart.
export function series(description: string, amount: number | number[], start: string, gaps: number[], category = "Subscriptions"): SeedTransaction[] {
  const dates = [start];
  for (const g of gaps) dates.push(addDays(dates[dates.length - 1], g));
  return dates.map((date, i) => tx(date, description, Array.isArray(amount) ? amount[i] : amount, category));
}
