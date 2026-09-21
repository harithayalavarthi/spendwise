import Link from "next/link";
import { getAnalytics } from "@/lib/insights";
import StatTile from "@/components/StatTile";
import CategoryBarChart from "@/components/CategoryBarChart";
import MonthlyTrendChart from "@/components/MonthlyTrendChart";
import SuggestionsList from "@/components/SuggestionsList";

export const dynamic = "force-dynamic";

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const analytics = getAnalytics();

  if (analytics.transactionCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--border)] py-24 text-center">
        <h1 className="text-xl font-semibold">No statements uploaded yet</h1>
        <p className="max-w-md text-sm text-[var(--text-secondary)]">
          Upload a CSV bank statement to see your spending broken down by category, trends over
          time, and suggestions to keep your finances on track.
        </p>
        <Link
          href="/upload"
          className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white"
        >
          Upload a statement
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {analytics.transactionCount} transactions across {analytics.monthlyTotals.length} month
          {analytics.monthlyTotals.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total income" value={formatCurrency(analytics.totalIncome)} tone="good" />
        <StatTile label="Total expenses" value={formatCurrency(analytics.totalExpense)} tone="bad" />
        <StatTile
          label="Net savings"
          value={formatCurrency(analytics.netSavings)}
          tone={analytics.netSavings >= 0 ? "good" : "bad"}
        />
        <StatTile
          label="Savings rate"
          value={analytics.savingsRate == null ? "—" : `${(analytics.savingsRate * 100).toFixed(0)}%`}
          tone={
            analytics.savingsRate == null ? "default" : analytics.savingsRate >= 0.15 ? "good" : "bad"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Spending by category</h2>
          <CategoryBarChart data={analytics.categoryTotals} />
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Income vs expenses</h2>
          <MonthlyTrendChart data={analytics.monthlyTotals} />
        </section>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Suggestions</h2>
        <SuggestionsList suggestions={analytics.suggestions} />
      </section>
    </div>
  );
}
