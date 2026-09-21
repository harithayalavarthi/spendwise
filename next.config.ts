import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (via pdf-parse) spins up a worker by resolving its own file at
  // runtime, which breaks if Next bundles it — keep it as a native require.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Self-contained server bundle for Electron packaging (electron/main.ts
  // spawns .next/standalone/server.js as a child process). File tracing can
  // miss non-JS assets pulled in by native/worker-based packages, so name
  // them explicitly rather than discovering a missing-file crash at runtime
  // in a packaged app where there's no node_modules to fall back on.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/better-sqlite3/build/Release/*.node",
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      "node_modules/pdf-parse/**/*",
      "node_modules/pdfjs-dist/**/*",
    ],
  },
  // IMPORTANT: without this, file tracing can pick up the *literal current
  // contents* of ./data (your real local database, if one exists on the
  // machine doing the build) and copy it into .next/standalone/data — which
  // would ship a developer's actual financial data inside the packaged app.
  // This must stay excluded regardless of what else changes here.
  outputFileTracingExcludes: {
    "/*": ["data/**/*", "**/*.db", "**/*.db-wal", "**/*.db-shm"],
  },
};

export default nextConfig;
