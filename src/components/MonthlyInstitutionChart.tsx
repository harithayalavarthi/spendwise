"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyInstitutionRow } from "@/lib/monthlyInsights";
import { getSeriesColorMap } from "./chartColors";

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function MonthlyInstitutionChart({
  data,
  institutions,
}: {
  data: MonthlyInstitutionRow[];
  institutions: string[];
}) {
  if (data.length === 0 || institutions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No institution-tagged spending yet — set an institution on a statement to see this chart.
      </p>
    );
  }

  const colors = getSeriesColorMap(institutions);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--gridline)" vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={{ stroke: "var(--axis)" }}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          tickFormatter={formatCurrency}
          width={64}
        />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
        {institutions.map((inst, i) => (
          <Bar
            key={inst}
            dataKey={inst}
            name={inst}
            stackId="institutions"
            fill={colors[inst]}
            radius={i === institutions.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
