"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

export default function PlaidConnectButton({ onConnected }: { onConnected: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { linkToken: string }) => {
        if (!ignore) setLinkToken(data.linkToken);
      })
      .catch(() => {
        if (!ignore) setError("Couldn't reach Plaid — check PLAID_CLIENT_ID/PLAID_SECRET in .env.local.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) return;
      setConnecting(true);
      setError(null);
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken, institutionName: metadata.institution?.name ?? null }),
        });
        if (!res.ok) throw new Error(String(res.status));
        onConnected();
      } catch {
        setError("Connected at Plaid, but couldn't finish importing transactions. Try syncing again in a moment.");
      } finally {
        setConnecting(false);
      }
    },
    [onConnected]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => open()}
        disabled={!ready || connecting}
        className="w-fit rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect a bank"}
      </button>
      {error && (
        <p className="rounded-md border border-[var(--status-critical)] bg-[var(--surface-1)] p-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}
