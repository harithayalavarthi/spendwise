"use client";

import { useEffect, useState } from "react";

interface Statement {
  id: number;
  filename: string;
  uploadedAt: string;
  transactionCount: number;
  institution: string | null;
}

const INSTITUTION_SUGGESTIONS = [
  "TD Bank",
  "Chase",
  "Bank of America",
  "Wells Fargo",
  "Capital One",
  "RBC",
  "Scotiabank",
  "BMO",
  "CIBC",
  "American Express",
];

export default function StatementsList({ refreshKey }: { refreshKey: number }) {
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

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

  function startEditing(s: Statement) {
    setEditingId(s.id);
    setEditValue(s.institution ?? "");
  }

  async function saveInstitution(id: number) {
    setSavingId(id);
    const institution = editValue.trim() || null;
    await fetch("/api/statements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, institution }),
    });
    setStatements((prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, institution } : s)));
    setSavingId(null);
    setEditingId(null);
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
      <datalist id="institution-edit-suggestions">
        {INSTITUTION_SUGGESTIONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <ul className="flex flex-col gap-2">
        {statements.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[var(--text-primary)]">{s.filename}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {s.uploadedAt} · {s.transactionCount} transaction{s.transactionCount === 1 ? "" : "s"}
              </p>
            </div>

            {editingId === s.id ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  list="institution-edit-suggestions"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveInstitution(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  placeholder="e.g. TD Bank"
                  className="w-36 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)]"
                />
                <button
                  onClick={() => saveInstitution(s.id)}
                  disabled={savingId === s.id}
                  className="rounded border border-[var(--series-1)] px-2 py-1 text-xs font-medium text-[var(--series-1)] disabled:opacity-50"
                >
                  {savingId === s.id ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => startEditing(s)}
                  className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
                  title="Set the financial institution for this statement"
                >
                  {s.institution ?? "+ institution"}
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--status-critical)] hover:text-[var(--status-critical)] disabled:opacity-50"
                >
                  {deletingId === s.id ? "Removing…" : "Remove"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
