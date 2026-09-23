"use client";

import { useState } from "react";
import PlaidConnectButton from "@/components/PlaidConnectButton";
import ConnectedAccountsList from "@/components/ConnectedAccountsList";

export default function AccountsPageContent() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Connected accounts</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Connect a bank directly (via Plaid) to pull in transactions automatically instead
          of uploading statements by hand. Transactions from connected accounts are
          categorized and analyzed the same way as anything you upload — this is an
          additional way to get data in, not a replacement for Upload.
        </p>
      </div>
      <PlaidConnectButton onConnected={() => setRefreshKey((k) => k + 1)} />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Your connected banks
        </h2>
        <ConnectedAccountsList refreshKey={refreshKey} />
      </section>
    </div>
  );
}
