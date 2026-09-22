// The Next.js dev server only prints its own request line (e.g.
// "POST /api/upload 200 in 340ms") — nothing about what happened inside a
// request. These are plain, always-on console logs (not a real logging
// framework — this is a local-first single-user app, not a service with log
// aggregation) so `npm run dev`'s terminal actually shows what the
// categorization pipeline, PDF parser, and LLM calls are doing.
function timestamp(): string {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

export function logInfo(scope: string, message: string, data?: unknown): void {
  console.log(`[${timestamp()}] [${scope}] ${message}`, data ?? "");
}

export function logWarn(scope: string, message: string, data?: unknown): void {
  console.warn(`[${timestamp()}] [${scope}] ${message}`, data ?? "");
}
