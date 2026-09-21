"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/categories";

interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  institution: string | null;
}

function formatCurrency(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (institutionFilter) params.set("institution", institutionFilter);
    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          setTransactions(data.transactions ?? []);
          setTotal(data.total ?? 0);
          setInstitutions(data.institutions ?? []);
        }
      });
    return () => {
      ignore = true;
    };
  }, [categoryFilter, institutionFilter]);

  async function updateCategory(id: number, category: string) {
    setTransactions((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, category } : t)));
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }),
    });
  }

  const filterDescriptions = [
    categoryFilter && `in ${categoryFilter}`,
    institutionFilter && `from ${institutionFilter}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {transactions === null
              ? "Loading…"
              : `${total} transaction${total === 1 ? "" : "s"}${
                  filterDescriptions.length ? ` ${filterDescriptions.join(" ")}` : " total"
                }`}
            {transactions !== null && total > transactions.length
              ? ` (showing most recent ${transactions.length})`
              : ""}
            {" — "}fix a miscategorized transaction below, corrections apply immediately.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={institutionFilter}
            onChange={(e) => setInstitutionFilter(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            <option value="">All institutions</option>
            {institutions.map((inst) => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {transactions === null ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No transactions found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Institution</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap text-[var(--text-secondary)]">{t.date}</td>
                  <td className="px-4 py-2 text-[var(--text-primary)]">{t.description}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-[var(--text-muted)]">
                    {t.institution ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      t.amount < 0 ? "text-[var(--text-primary)]" : "text-[var(--status-good)]"
                    }`}
                  >
                    {formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={t.category}
                      onChange={(e) => updateCategory(t.id, e.target.value)}
                      className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
