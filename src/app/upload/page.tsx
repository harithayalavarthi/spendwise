import UploadForm from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Upload a statement</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Export your bank statement as CSV and upload it here. Transactions are parsed,
          auto-categorized, and stored locally in this app&apos;s SQLite database — nothing is
          sent anywhere else.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
