"use client";

import { useState } from "react";
import UploadForm from "@/components/UploadForm";
import StatementsList from "@/components/StatementsList";

export default function UploadPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Upload a statement</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Export your bank statement as CSV (most reliable) or upload a PDF directly.
          Transactions are parsed, auto-categorized, and stored locally in this app&apos;s
          SQLite database — nothing is sent anywhere else. Every statement you upload is
          added to what&apos;s already there; re-uploading one you&apos;ve already imported
          automatically skips duplicates instead of double-counting.
        </p>
      </div>
      <UploadForm onUploaded={() => setRefreshKey((k) => k + 1)} />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Your uploaded statements
        </h2>
        <StatementsList refreshKey={refreshKey} />
      </section>
    </div>
  );
}
