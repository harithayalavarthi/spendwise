import { getDb } from "./db";
import type { CategoryTotal } from "./insights";

export interface MonthlyInstitutionRow {
  month: string;
  [institution: string]: number | string; // dynamic institution keys -> totals
}

export interface MonthDetail {
  month: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  institutionTotals: Array<{ institution: string; total: number }>;
}

export interface TopSpendingDay {
  date: string;
  total: number;
  transactionCount: number;
  topDescription: string;
  topAmount: number;
}

export interface DayOfWeekPattern {
  dayOfWeek: string; // "Sun" .. "Sat"
  total: number;
  average: number;
  count: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// All institution names that appear anywhere, in first-seen (upload) order —
// used to assign each institution a stable color regardless of which months
// or filters are in view.
export function getKnownInstitutions(): string[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT institution, MIN(id) AS firstId
       FROM transactions
       WHERE institution IS NOT NULL
       GROUP BY institution
       ORDER BY firstId ASC`
    )
    .all()
    .map((r) => (r as { institution: string }).institution);
}

export function getMonthlyInstitutionBreakdown(): MonthlyInstitutionRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         substr(date, 1, 7) AS month,
         COALESCE(institution, 'Unknown') AS institution,
         SUM(-amount) AS total
       FROM transactions
       WHERE amount < 0 AND category != 'Transfers'
       GROUP BY month, institution
       ORDER BY month ASC`
    )
    .all() as Array<{ month: string; institution: string; total: number }>;

  const byMonth = new Map<string, MonthlyInstitutionRow>();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
    byMonth.get(r.month)![r.institution] = r.total;
  }
  return Array.from(byMonth.values());
}

export function getAvailableMonths(): string[] {
  const db = getDb();
  return db
    .prepare(`SELECT DISTINCT substr(date, 1, 7) AS month FROM transactions ORDER BY month DESC`)
    .all()
    .map((r) => (r as { month: string }).month);
}

export function getMonthDetail(month: string): MonthDetail | null {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 AND category != 'Transfers' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN amount < 0 AND category != 'Transfers' THEN -amount ELSE 0 END), 0) AS expense,
         COUNT(*) AS count
       FROM transactions
       WHERE substr(date, 1, 7) = ?`
    )
    .get(month) as { income: number; expense: number; count: number };

  if (totals.count === 0) return null;

  const categoryTotals = db
    .prepare(
      `SELECT category, SUM(-amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE substr(date, 1, 7) = ? AND amount < 0 AND category != 'Transfers'
       GROUP BY category
       ORDER BY total DESC`
    )
    .all(month) as CategoryTotal[];

  const institutionTotals = db
    .prepare(
      `SELECT COALESCE(institution, 'Unknown') AS institution, SUM(-amount) AS total
       FROM transactions
       WHERE substr(date, 1, 7) = ? AND amount < 0 AND category != 'Transfers'
       GROUP BY institution
       ORDER BY total DESC`
    )
    .all(month) as Array<{ institution: string; total: number }>;

  return {
    month,
    income: totals.income,
    expense: totals.expense,
    net: totals.income - totals.expense,
    transactionCount: totals.count,
    categoryTotals,
    institutionTotals,
  };
}

export function getTopSpendingDays(limit = 8): TopSpendingDay[] {
  const db = getDb();

  const dayTotals = db
    .prepare(
      `SELECT date, SUM(-amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE amount < 0 AND category != 'Transfers'
       GROUP BY date
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ date: string; total: number; count: number }>;

  const topDescStmt = db.prepare(
    `SELECT description, -amount AS amount
     FROM transactions
     WHERE date = ? AND amount < 0 AND category != 'Transfers'
     ORDER BY amount ASC
     LIMIT 1`
  );

  return dayTotals.map((d) => {
    const top = topDescStmt.get(d.date) as { description: string; amount: number } | undefined;
    return {
      date: d.date,
      total: d.total,
      transactionCount: d.count,
      topDescription: top?.description ?? "",
      topAmount: top?.amount ?? 0,
    };
  });
}

export function getDayOfWeekPattern(): DayOfWeekPattern[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', date) AS INTEGER) AS dow,
         SUM(-amount) AS total,
         COUNT(*) AS count
       FROM transactions
       WHERE amount < 0 AND category != 'Transfers'
       GROUP BY dow`
    )
    .all() as Array<{ dow: number; total: number; count: number }>;

  const byDow = new Map(rows.map((r) => [r.dow, r]));
  return DAY_NAMES.map((name, i) => {
    const r = byDow.get(i);
    return {
      dayOfWeek: name,
      total: r?.total ?? 0,
      average: r && r.count > 0 ? r.total / r.count : 0,
      count: r?.count ?? 0,
    };
  });
}
