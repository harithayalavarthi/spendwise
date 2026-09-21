"use client";

import { useState } from "react";
import type { MonthDetail } from "@/lib/monthlyInsights";
import StatTile from "./StatTile";
import LabeledBarChart from "./LabeledBarChart";
import { CATEGORY_COLORS, getSeriesColorMap } from "./chartColors";

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MonthExplorer({
  months,
  institutionOrder,
}: {
  months: MonthDetail[];
  institutionOrder: string[];
}) {
  const [selected, setSelected] = useState(months[0]?.month ?? "");
  const detail = months.find((m) => m.month === selected);
  const institutionColors = getSeriesColorMap(institutionOrder);

  if (months.length === 0 || !detail) {
    return <p className="text-sm text-[var(--text-muted)]">Upload a statement to explore months.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-fit rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
      >
        {months.map((m) => (
          <option key={m.month} value={m.month}>
            {m.month}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Income" value={formatCurrency(detail.income)} tone="good" />
        <StatTile label="Expenses" value={formatCurrency(detail.expense)} tone="bad" />
        <StatTile
          label="Net"
          value={formatCurrency(detail.net)}
          tone={detail.net >= 0 ? "good" : "bad"}
        />
        <StatTile label="Transactions" value={String(detail.transactionCount)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            By category
          </h3>
          <LabeledBarChart
            data={detail.categoryTotals.map((c) => ({ name: c.category, total: c.total }))}
            colors={CATEGORY_COLORS}
            emptyMessage="No categorized spending this month."
          />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            By institution
          </h3>
          <LabeledBarChart
            data={detail.institutionTotals.map((i) => ({ name: i.institution, total: i.total }))}
            colors={institutionColors}
            emptyMessage="No institution-tagged spending this month."
          />
        </div>
      </div>
    </div>
  );
}
