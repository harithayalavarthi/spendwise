"use client";

import { useEffect, useState } from "react";

interface PlaidItem {
  itemDbId: number;
  statementId: number;
  institution: string | null;
  transactionCount: number;
  lastSyncedAt: string | null;
  connectedAt: string;
}

interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

async function runSync(itemDbId: number): Promise<SyncResult | null> {
  const res = await fetch(`/api/plaid/sync/${itemDbId}`, { method: "POST" });
  return res.ok ? ((await res.json()) as SyncResult) : null;
}

function applySyncResult(items: PlaidItem[], itemDbId: number, result: SyncResult): PlaidItem[] {
  return items.map((i) =>
    i.itemDbId === itemDbId
      ? { ...i, transactionCount: i.transactionCount + result.added - result.removed, lastSyncedAt: new Date().toISOString() }
      : i
  );
}

export default function ConnectedAccountsList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<PlaidItem[] | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/plaid/items")
      .then((res) => res.json())
      .then((data: { items: PlaidItem[] }) => {
        if (ignore) return;
        const loaded = data.items ?? [];
        setItems(loaded);
        // Best-effort sync on page load — there's no webhook receiver for a
        // local desktop app, so "check for new transactions" happens when
        // the user is actually looking at this page, not in true real time.
        // Silent (no spinner) so opening the page doesn't feel like a
        // blocking operation; a failure here just means slightly stale data
        // until the next load or a manual "Sync now".
        for (const item of loaded) {
          runSync(item.itemDbId)
            .then((result) => {
              if (!ignore && result) setItems((prev) => applySyncResult(prev ?? [], item.itemDbId, result));
            })
            .catch(() => {});
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  async function handleSync(item: PlaidItem) {
    setSyncingId(item.itemDbId);
    setError(null);
    const result = await runSync(item.itemDbId).catch(() => null);
    if (result) {
      setItems((prev) => applySyncResult(prev ?? [], item.itemDbId, result));
    } else {
      setError(`Couldn't sync ${item.institution ?? "that account"} — try again in a moment.`);
    }
    setSyncingId(null);
  }

  async function handleDisconnect(item: PlaidItem) {
    setDisconnectingId(item.itemDbId);
    await fetch(`/api/statements?id=${item.statementId}`, { method: "DELETE" });
    setItems((prev) => (prev ?? []).filter((i) => i.itemDbId !== item.itemDbId));
    setDisconnectingId(null);
  }

  if (items === null) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No banks connected yet — connect one above to pull in transactions automatically.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md border border-[var(--status-critical)] bg-[var(--surface-1)] p-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.itemDbId}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[var(--text-primary)]">{item.institution ?? "Connected bank"}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {item.transactionCount} transaction{item.transactionCount === 1 ? "" : "s"} ·{" "}
                {item.lastSyncedAt ? `last synced ${item.lastSyncedAt}` : "not yet synced"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => handleSync(item)}
                disabled={syncingId === item.itemDbId}
                className="rounded border border-[var(--series-1)] px-2 py-1 text-xs font-medium text-[var(--series-1)] disabled:opacity-50"
              >
                {syncingId === item.itemDbId ? "Syncing…" : "Sync now"}
              </button>
              <button
                onClick={() => handleDisconnect(item)}
                disabled={disconnectingId === item.itemDbId}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--status-critical)] hover:text-[var(--status-critical)] disabled:opacity-50"
              >
                {disconnectingId === item.itemDbId ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
