export default function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  const valueColor =
    tone === "good"
      ? "text-[var(--status-good)]"
      : tone === "bad"
        ? "text-[var(--status-critical)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}
