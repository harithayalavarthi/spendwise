"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayOfWeekPattern } from "@/lib/monthlyInsights";

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function DayOfWeekChart({ data }: { data: DayOfWeekPattern[] }) {
  const hasData = data.some((d) => d.count > 0);
  if (!hasData) {
    return <p className="text-sm text-[var(--text-muted)]">No spending yet to show a day-of-week pattern.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--gridline)" vertical={false} />
        <XAxis
          dataKey="dayOfWeek"
          tickLine={false}
          axisLine={{ stroke: "var(--axis)" }}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          tickFormatter={formatCurrency}
          width={56}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value)), name === "average" ? "Avg per transaction" : "Total"]}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="total" name="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
