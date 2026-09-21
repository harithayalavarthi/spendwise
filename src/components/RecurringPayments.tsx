import type { RecurringPayment, RecurringStatus } from "@/lib/recurringPayments";

const STATUS_STYLES: Record<RecurringStatus, { color: string; label: string }> = {
  missed: { color: "var(--status-critical)", label: "Missed?" },
  "due-soon": { color: "var(--status-warning)", label: "Due soon" },
  "on-track": { color: "var(--status-good)", label: "On track" },
};

const CADENCE_LABEL: Record<RecurringPayment["cadence"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function formatCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecurringPayments({ payments }: { payments: RecurringPayment[] }) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No recurring payments detected yet — this needs at least 3 similarly-timed, similarly-sized
        charges from the same merchant to identify a pattern.
      </p>
    );
  }

  const missedCount = payments.filter((p) => p.status === "missed").length;

  return (
    <div className="flex flex-col gap-3">
      {missedCount > 0 && (
        <p className="text-sm text-[var(--status-critical)]">
          {missedCount} recurring payment{missedCount === 1 ? "" : "s"} may have been missed —
          flagged below.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Merchant</th>
              <th className="px-4 py-2 font-medium">Cadence</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th className="px-4 py-2 font-medium">Last charged</th>
              <th className="px-4 py-2 font-medium">Expected next</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const style = STATUS_STYLES[p.status];
              return (
                <tr key={p.merchantKey} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 text-[var(--text-primary)]">
                    {p.description}
                    {p.institution && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">{p.institution}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{CADENCE_LABEL[p.cadence]}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--text-primary)]">
                    ~{formatCurrency(p.averageAmount)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-[var(--text-secondary)]">{p.lastDate}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-[var(--text-secondary)]">
                    {p.expectedNextDate}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: style.color, border: `1px solid ${style.color}` }}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: style.color }}
                      />
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
