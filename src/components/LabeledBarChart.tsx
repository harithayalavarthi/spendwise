"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface LabeledBarDatum {
  name: string;
  total: number;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function LabeledBarChart({
  data,
  colors,
  emptyMessage,
}: {
  data: LabeledBarDatum[];
  colors: Record<string, string>;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  const chartData = data.slice(0, 10);
  const height = Math.max(chartData.length * 36, 120);
  const maxTotal = Math.max(...chartData.map((d) => d.total));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <XAxis type="number" hide domain={[0, maxTotal * 1.15]} />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--gridline)" }}
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={colors[entry.name] ?? "var(--series-1)"} />
          ))}
          <LabelList
            dataKey="total"
            position="right"
            formatter={(value) => formatCurrency(Number(value))}
            fill="var(--text-secondary)"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
