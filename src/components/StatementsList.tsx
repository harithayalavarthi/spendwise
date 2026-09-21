"use client";

import { useEffect, useState } from "react";

interface Statement {
  id: number;
  filename: string;
  uploadedAt: string;
  transactionCount: number;
}

export default function StatementsList({ refreshKey }: { refreshKey: number }) {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/statements")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setStatements(data.statements ?? []);
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    await fetch(`/api/statements?id=${id}`, { method: "DELETE" });
    setStatements((prev) => (prev ?? []).filter((s) => s.id !== id));
    setDeletingId(null);
  }

  if (statements === null) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  }

  if (statements.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No statements uploaded yet — each one you upload will show up here and stay,
        alongside any others.
      </p>
    );
  }

  const totalTransactions = statements.reduce((sum, s) => sum + s.transactionCount, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-secondary)]">
        {statements.length} statement{statements.length === 1 ? "" : "s"} stored,{" "}
        {totalTransactions} transaction{totalTransactions === 1 ? "" : "s"} total.
      </p>
      <ul className="flex flex-col gap-2">
        {statements.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--text-primary)]">{s.filename}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {s.uploadedAt} · {s.transactionCount} transaction{s.transactionCount === 1 ? "" : "s"}
              </p>
            </div>
            <button
              onClick={() => handleDelete(s.id)}
              disabled={deletingId === s.id}
              className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--status-critical)] hover:text-[var(--status-critical)] disabled:opacity-50"
            >
              {deletingId === s.id ? "Removing…" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
