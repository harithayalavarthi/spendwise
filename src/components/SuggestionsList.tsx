import type { Suggestion } from "@/lib/insights";

const SEVERITY_STYLES: Record<Suggestion["severity"], { border: string; icon: string; label: string }> = {
  info: { border: "var(--series-1)", icon: "i", label: "Tip" },
  warning: { border: "var(--status-warning)", icon: "!", label: "Watch" },
  critical: { border: "var(--status-critical)", icon: "!", label: "Action needed" },
};

export default function SuggestionsList({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Upload a few statements and suggestions will show up here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {suggestions.map((s, i) => {
        const style = SEVERITY_STYLES[s.severity];
        return (
          <li
            key={i}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"
            style={{ borderLeft: `3px solid ${style.border}` }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: style.border }}
              >
                {style.icon}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {style.label}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{s.title}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{s.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
