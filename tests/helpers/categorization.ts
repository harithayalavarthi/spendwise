// Helpers for the categorization tests: a fake Ollama and a clean merchant
// cache. The LLM is always faked (tests/setup.ts blocks the network), so these
// build the exact response shape llmCategorize.ts parses from /api/chat.
import { vi, type Mock } from "vitest";
import { getDb } from "@/lib/db";

export type FetchMock = Mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>;

// What Ollama's /api/chat returns with `format` set: the model's JSON answer
// as a string inside message.content.
export function ollamaAnswer(category: string): Response {
  return Response.json({ message: { role: "assistant", content: JSON.stringify({ category }) } });
}

export function stubFetch(impl: () => Promise<Response>): FetchMock {
  const mock: FetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function stubOllamaAnswer(category: string): FetchMock {
  return stubFetch(async () => ollamaAnswer(category));
}

// "Ollama isn't running": Node's fetch rejects with a TypeError on ECONNREFUSED.
export function stubOllamaDown(): FetchMock {
  return stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
}

export interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
  rawBody: string;
}

export function capturedRequest(mock: FetchMock, call = 0): CapturedRequest {
  const [input, init = {}] = mock.mock.calls[call];
  const rawBody = String(init.body);
  return { url: String(input), init, body: JSON.parse(rawBody) as Record<string, unknown>, rawBody };
}

export function clearMerchantCache(): void {
  getDb().prepare("DELETE FROM merchant_categories").run();
}

export function merchantCacheRow(merchantKey: string): { category: string; source: string } | undefined {
  return getDb()
    .prepare("SELECT category, source FROM merchant_categories WHERE merchant_key = ?")
    .get(merchantKey) as { category: string; source: string } | undefined;
}

// The logger is always-on console output; keep test output readable while
// still letting tests assert that a fallback was logged.
export function silenceLogs(): { warn: Mock; info: Mock } {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as Mock,
    info: vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as Mock,
  };
}
