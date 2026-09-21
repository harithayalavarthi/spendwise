"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface UploadResult {
  imported: number;
  duplicates: number;
  skippedRows: number;
  warning?: string;
  categoryCounts: Record<string, number>;
  llmCategorized: number;
}

export default function UploadForm() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("done");
      router.refresh();
    } catch {
      setError("Upload failed — check your connection and try again");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Bank statement (CSV or PDF)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.pdf,application/pdf"
            required
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-secondary)] file:mr-3 file:rounded file:border-0 file:bg-[var(--series-1)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
        </label>
        <button
          type="submit"
          disabled={status === "uploading"}
          className="w-fit rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "uploading" ? "Uploading & categorizing…" : "Upload & categorize"}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-[var(--status-critical)] bg-[var(--surface-1)] p-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm">
          <p className="font-medium text-[var(--text-primary)]">
            Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}
            {result.duplicates > 0
              ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped)`
              : ""}
            {result.skippedRows > 0 ? ` (${result.skippedRows} unrecognized rows skipped)` : ""}
          </p>
          {result.llmCategorized > 0 && (
            <p className="mt-1 text-[var(--text-secondary)]">
              {result.llmCategorized} transaction{result.llmCategorized === 1 ? "" : "s"} categorized by
              the local LLM (merchants not covered by keyword rules) — worth a quick check on the
              Transactions page.
            </p>
          )}
          {result.warning && (
            <p className="mt-1 text-[var(--status-warning)]">{result.warning}</p>
          )}
          <ul className="mt-2 flex flex-wrap gap-2">
            {Object.entries(result.categoryCounts).map(([category, count]) => (
              <li
                key={category}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
              >
                {category}: {count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
