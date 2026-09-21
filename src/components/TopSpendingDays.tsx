import type { TopSpendingDay } from "@/lib/monthlyInsights";

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TopSpendingDays({ days }: { days: TopSpendingDay[] }) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No spending yet — upload a statement to see your highest-spend days.
      </p>
    );
  }

  const maxTotal = days[0].total;

  return (
    <ul className="flex flex-col gap-2">
      {days.map((d, i) => (
        <li key={d.date} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right text-xs font-medium text-[var(--text-muted)]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">{d.date}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--status-critical)]">
                {formatCurrency(d.total)}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 rounded-full bg-[var(--gridline)]"
              style={{ position: "relative" }}
            >
              <div
                className="h-1.5 rounded-full bg-[var(--series-2)]"
                style={{ width: `${Math.max((d.total / maxTotal) * 100, 4)}%` }}
              />
            </div>
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {d.transactionCount} transaction{d.transactionCount === 1 ? "" : "s"}
              {d.topDescription ? ` · largest: ${d.topDescription} (${formatCurrency(d.topAmount)})` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
