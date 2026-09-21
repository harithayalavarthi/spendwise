import { getDb } from "./db";

export interface CategoryTotal {
  category: string;
  total: number; // positive number, expenses only
  count: number;
}

export interface MonthlyTotal {
  month: string; // yyyy-mm
  income: number;
  expense: number; // positive number
  net: number;
}

export interface Suggestion {
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface Analytics {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number | null; // null when there's no income data
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
  suggestions: Suggestion[];
  transactionCount: number;
}

export function getAnalytics(): Analytics {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 AND category != 'Transfers' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN amount < 0 AND category != 'Transfers' THEN -amount ELSE 0 END), 0) AS expense,
         COUNT(*) AS count
       FROM transactions`
    )
    .get() as { income: number; expense: number; count: number };

  const categoryRows = db
    .prepare(
      `SELECT category, SUM(-amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE amount < 0 AND category != 'Transfers'
       GROUP BY category
       ORDER BY total DESC`
    )
    .all() as CategoryTotal[];

  const monthlyRows = db
    .prepare(
      `SELECT
         substr(date, 1, 7) AS month,
         COALESCE(SUM(CASE WHEN amount > 0 AND category != 'Transfers' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN amount < 0 AND category != 'Transfers' THEN -amount ELSE 0 END), 0) AS expense
       FROM transactions
       GROUP BY month
       ORDER BY month ASC`
    )
    .all() as Array<{ month: string; income: number; expense: number }>;

  const monthlyTotals: MonthlyTotal[] = monthlyRows.map((r) => ({
    month: r.month,
    income: r.income,
    expense: r.expense,
    net: r.income - r.expense,
  }));

  const savingsRate = totals.income > 0 ? (totals.income - totals.expense) / totals.income : null;

  const suggestions = buildSuggestions({
    totalIncome: totals.income,
    totalExpense: totals.expense,
    categoryTotals: categoryRows,
    monthlyTotals,
  });

  return {
    totalIncome: totals.income,
    totalExpense: totals.expense,
    netSavings: totals.income - totals.expense,
    savingsRate,
    categoryTotals: categoryRows,
    monthlyTotals,
    suggestions,
    transactionCount: totals.count,
  };
}

function buildSuggestions(params: {
  totalIncome: number;
  totalExpense: number;
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
}): Suggestion[] {
  const { totalIncome, totalExpense, categoryTotals, monthlyTotals } = params;
  const suggestions: Suggestion[] = [];

  if (categoryTotals.length === 0) {
    return suggestions;
  }

  const top = categoryTotals[0];
  if (totalExpense > 0) {
    const share = top.total / totalExpense;
    if (share >= 0.35) {
      suggestions.push({
        title: `${top.category} is eating your budget`,
        detail: `${top.category} makes up ${(share * 100).toFixed(0)}% of your total spending ($${top.total.toFixed(2)}). Consider setting a monthly cap for this category.`,
        severity: share >= 0.5 ? "critical" : "warning",
      });
    }
  }

  // Month-over-month category spikes (needs at least 2 months of data)
  if (monthlyTotals.length >= 2) {
    const db = getDb();
    const lastMonth = monthlyTotals[monthlyTotals.length - 1].month;
    const prevMonth = monthlyTotals[monthlyTotals.length - 2].month;

    const byCategory = db
      .prepare(
        `SELECT
           category,
           SUM(CASE WHEN substr(date,1,7) = ? THEN -amount ELSE 0 END) AS last,
           SUM(CASE WHEN substr(date,1,7) = ? THEN -amount ELSE 0 END) AS prev
         FROM transactions
         WHERE amount < 0 AND category != 'Transfers'
         GROUP BY category
         HAVING last > 0 OR prev > 0`
      )
      .all(lastMonth, prevMonth) as Array<{ category: string; last: number; prev: number }>;

    for (const row of byCategory) {
      if (row.prev >= 20 && row.last > row.prev * 1.2) {
        const pctChange = ((row.last - row.prev) / row.prev) * 100;
        suggestions.push({
          title: `${row.category} spending jumped this month`,
          detail: `${row.category} rose ${pctChange.toFixed(0)}% vs last month ($${row.prev.toFixed(2)} → $${row.last.toFixed(2)}).`,
          severity: "warning",
        });
      }
    }
  }

  // Savings rate check
  if (totalIncome > 0) {
    const savingsRate = (totalIncome - totalExpense) / totalIncome;
    if (savingsRate < 0) {
      suggestions.push({
        title: "You're spending more than you earn",
        detail: `Expenses ($${totalExpense.toFixed(2)}) exceed income ($${totalIncome.toFixed(2)}) across your uploaded statements. Review discretionary categories first.`,
        severity: "critical",
      });
    } else if (savingsRate < 0.1) {
      suggestions.push({
        title: "Savings rate is thin",
        detail: `You're saving ${(savingsRate * 100).toFixed(0)}% of income. A common target is 15-20%; look at your top spending categories for room to cut.`,
        severity: "warning",
      });
    } else if (savingsRate >= 0.2) {
      suggestions.push({
        title: "Healthy savings rate",
        detail: `You're saving ${(savingsRate * 100).toFixed(0)}% of income across your uploaded statements. Keep it up.`,
        severity: "info",
      });
    }
  }

  // Subscriptions check
  const subs = categoryTotals.find((c) => c.category === "Subscriptions");
  if (subs && subs.total > 0) {
    suggestions.push({
      title: "Review recurring subscriptions",
      detail: `You spent $${subs.total.toFixed(2)} across ${subs.count} subscription charge${subs.count === 1 ? "" : "s"}. Cancel anything you no longer use.`,
      severity: "info",
    });
  }

  return suggestions;
}
