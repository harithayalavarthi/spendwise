import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (via pdf-parse) spins up a worker by resolving its own file at
  // runtime, which breaks if Next bundles it — keep it as a native require.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
