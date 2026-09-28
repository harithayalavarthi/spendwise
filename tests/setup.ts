// Runs before every test file (vitest.config.ts `setupFiles`).
//
// db.ts falls back to the REAL project database (data/spendwise.db) when
// SPENDWISE_DATA_DIR isn't set, so every test file gets its own throwaway
// directory here — before any app module is imported — and we refuse to run
// at all if that ever resolves to the real data directory.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, vi } from "vitest";

const realDataDir = path.resolve(process.cwd(), "data");
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spendwise-test-"));
process.env.SPENDWISE_DATA_DIR = testDataDir;

if (path.resolve(testDataDir) === realDataDir || path.resolve(testDataDir).startsWith(realDataDir + path.sep)) {
  throw new Error(`Refusing to run tests against the real data directory: ${testDataDir}`);
}

// No feature is enabled unless a test turns it on explicitly.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("FEATURE_")) delete process.env[key];
}
// Never talk to a real Plaid account or a real Ollama from tests.
delete process.env.PLAID_CLIENT_ID;
delete process.env.PLAID_SECRET;
process.env.PLAID_ENV = "sandbox";
process.env.OLLAMA_HOST = "http://ollama.test.invalid";

// Block all network access by default. A test that needs fetch (e.g. the LLM
// categorizer) replaces it with vi.stubGlobal("fetch", vi.fn(...)).
beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Network access is disabled in tests — stub fetch with vi.stubGlobal in this test.");
  });
});

afterAll(() => {
  const db = (globalThis as { __spendwiseDb?: { close(): void } }).__spendwiseDb;
  db?.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
