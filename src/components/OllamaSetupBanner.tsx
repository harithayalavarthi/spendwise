"use client";

import { useEffect, useState } from "react";

// Populated by electron/preload.ts via contextBridge — only present when
// this page is running inside the packaged desktop app, never in a normal
// browser (dev server or self-hosted), so this component renders nothing
// there.
interface SpendwiseElectronBridge {
  isElectron: true;
  ollamaStatus: () => Promise<{ running: boolean; modelPulled: boolean }>;
  openOllamaDownloadPage: () => Promise<void>;
  pullModel: () => Promise<void>;
  onPullProgress: (cb: (p: { status: string; completed?: number; total?: number; done: boolean; error?: string }) => void) => () => void;
}

declare global {
  interface Window {
    spendwiseElectron?: SpendwiseElectronBridge;
  }
}

type Phase = "checking" | "not-installed" | "installed-no-model" | "pulling" | "ready" | "dismissed";

export default function OllamaSetupBanner() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bridge = typeof window !== "undefined" ? window.spendwiseElectron : undefined;

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    bridge.ollamaStatus().then((status) => {
      if (cancelled) return;
      if (!status.running) setPhase("not-installed");
      else if (!status.modelPulled) setPhase("installed-no-model");
      else setPhase("ready");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bridge || phase === "checking" || phase === "ready" || phase === "dismissed") {
    return null;
  }

  async function recheckStatus() {
    if (!bridge) return;
    const status = await bridge.ollamaStatus();
    if (!status.running) setPhase("not-installed");
    else if (!status.modelPulled) setPhase("installed-no-model");
    else setPhase("ready");
  }

  async function startPull() {
    if (!bridge) return;
    setPhase("pulling");
    setError(null);
    const unsubscribe = bridge.onPullProgress((p) => {
      if (p.error) {
        setError(p.error);
        return;
      }
      if (p.total && p.completed != null) {
        setProgress({ completed: p.completed, total: p.total });
      }
      if (p.done) {
        unsubscribe();
        if (!p.error) setPhase("ready");
        else setPhase("installed-no-model");
      }
    });
    await bridge.pullModel();
  }

  return (
    <div className="mb-6 rounded-lg border border-[var(--series-1)] bg-[var(--surface-1)] p-4 text-sm">
      {phase === "not-installed" && (
        <>
          <p className="font-medium text-[var(--text-primary)]">
            Set up smart categorization (optional)
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            Keyword-based categorization already works without this. Installing Ollama adds a local
            AI fallback for merchants keywords don&apos;t recognize — it runs entirely on this
            machine, nothing is sent anywhere.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => bridge?.openOllamaDownloadPage()}
              className="rounded-md bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Download Ollama
            </button>
            <button
              onClick={recheckStatus}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
            >
              I&apos;ve installed it — check again
            </button>
            <button
              onClick={() => setPhase("dismissed")}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)]"
            >
              Skip for now
            </button>
          </div>
        </>
      )}

      {phase === "installed-no-model" && (
        <>
          <p className="font-medium text-[var(--text-primary)]">Ollama is running — download the model</p>
          <p className="mt-1 text-[var(--text-secondary)]">
            One-time download, about 4.7 GB. Keyword categorization works fine while you wait, or if
            you skip this entirely.
          </p>
          {error && <p className="mt-1 text-[var(--status-critical)]">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={startPull}
              className="rounded-md bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Download model (~4.7 GB)
            </button>
            <button
              onClick={() => setPhase("dismissed")}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)]"
            >
              Skip for now
            </button>
          </div>
        </>
      )}

      {phase === "pulling" && (
        <>
          <p className="font-medium text-[var(--text-primary)]">Downloading model…</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--gridline)]">
            <div
              className="h-2 rounded-full bg-[var(--series-1)] transition-all"
              style={{
                width: progress ? `${Math.min((progress.completed / progress.total) * 100, 100)}%` : "5%",
              }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {progress
              ? `${(progress.completed / 1e9).toFixed(2)} GB / ${(progress.total / 1e9).toFixed(2)} GB`
              : "Starting…"}{" "}
            — you can keep using the app while this downloads.
          </p>
        </>
      )}
    </div>
  );
}
