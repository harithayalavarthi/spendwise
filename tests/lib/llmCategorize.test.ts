import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/lib/categories";
import { categorizeWithOllama } from "@/lib/llmCategorize";
import {
  capturedRequest,
  ollamaAnswer,
  silenceLogs,
  stubFetch,
  stubOllamaAnswer,
  stubOllamaDown,
} from "../helpers/categorization";

// tests/setup.ts sets OLLAMA_HOST to this unroutable host before any app code loads.
const TEST_OLLAMA_CHAT_URL = "http://ollama.test.invalid/api/chat";

let logs: ReturnType<typeof silenceLogs>;
beforeEach(() => {
  logs = silenceLogs();
});

describe("categorizeWithOllama — answers (CAT-2)", () => {
  it.each(CATEGORIES)("returns a valid category as-is: %s", async (category) => {
    stubOllamaAnswer(category);
    await expect(categorizeWithOllama("QWILLBY NOOK")).resolves.toBe(category);
  });

  // "Other" is a legitimate answer the prompt asks for when a description has
  // no clue — it is returned (and so cached), not treated as a failure.
  it('returns "Other" as a real answer, not null', async () => {
    stubOllamaAnswer("Other");
    await expect(categorizeWithOllama("XQ 7Z REF")).resolves.toBe("Other");
  });

  it.each(["Groceries & Stuff", "groceries", "Food", "", "OTHER"])(
    "rejects a category outside the fixed list (%j) with null and logs why",
    async (answer) => {
      stubOllamaAnswer(answer);
      await expect(categorizeWithOllama("QWILLBY NOOK")).resolves.toBeNull();
      expect(logs.warn).toHaveBeenCalled();
    },
  );

  it.each([
    ["no message content", () => Response.json({ message: {} })],
    ["no message at all", () => Response.json({ done: true })],
    ["content that isn't JSON", () => Response.json({ message: { content: "Groceries" } })],
    ["JSON without a category field", () => Response.json({ message: { content: '{"label":"Groceries"}' } })],
  ])("returns null for a malformed response: %s", async (_label, makeResponse) => {
    stubFetch(async () => makeResponse());
    await expect(categorizeWithOllama("QWILLBY NOOK")).resolves.toBeNull();
    expect(logs.warn).toHaveBeenCalled();
  });
});

describe("categorizeWithOllama — failures fall back to null (CAT-2)", () => {
  it("returns null when Ollama isn't running (connection refused)", async () => {
    const fetchMock = stubOllamaDown();
    await expect(categorizeWithOllama("QWILLBY NOOK")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(logs.warn.mock.calls[0][0])).toMatch(/fetch failed/);
  });

  it.each([404, 500, 503])("returns null on HTTP %d and logs the status", async (status) => {
    stubFetch(async () => new Response("model not found", { status }));
    await expect(categorizeWithOllama("QWILLBY NOOK")).resolves.toBeNull();
    expect(String(logs.warn.mock.calls[0][0])).toContain(String(status));
  });

  describe("timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("aborts a hung request and returns null", async () => {
      vi.useFakeTimers();
      stubFetch(
        (...args: unknown[]) =>
          new Promise<Response>((_resolve, reject) => {
            const init = args[1] as RequestInit;
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      );
      const result = categorizeWithOllama("QWILLBY NOOK");
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(result).resolves.toBeNull();
      expect(String(logs.warn.mock.calls[0][0])).toMatch(/timed out/);
    });
  });
});

describe("categorizeWithOllama — request shape", () => {
  it("POSTs to the configured Ollama host's /api/chat", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    await categorizeWithOllama("QWILLBY NOOK");
    expect(fetchMock).toHaveBeenCalledOnce();
    const req = capturedRequest(fetchMock);
    expect(req.url).toBe(TEST_OLLAMA_CHAT_URL);
    expect(req.init.method).toBe("POST");
  });

  it("asks for a deterministic (temperature 0), non-streamed answer constrained to the category list", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    await categorizeWithOllama("QWILLBY NOOK");
    const { body } = capturedRequest(fetchMock);
    expect(body.options).toEqual({ temperature: 0 });
    expect(body.stream).toBe(false);
    expect(body.format).toMatchObject({
      properties: { category: { type: "string", enum: [...CATEGORIES] } },
      required: ["category"],
    });
  });

  it("defaults to localhost when OLLAMA_HOST isn't set (NFR-2)", async () => {
    const saved = process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_HOST;
    try {
      vi.resetModules();
      const { categorizeWithOllama: fresh } = await import("@/lib/llmCategorize");
      const fetchMock = stubOllamaAnswer("Shopping");
      await fresh("QWILLBY NOOK");
      expect(new URL(capturedRequest(fetchMock).url).hostname).toBe("localhost");
    } finally {
      process.env.OLLAMA_HOST = saved;
      vi.resetModules();
    }
  });
});

describe("categorizeWithOllama — privacy (NFR-2)", () => {
  it("takes only a description: there is no parameter for amount, date, or account", () => {
    expect(categorizeWithOllama.length).toBe(1);
  });

  it("sends only the description in the prompt, and only the expected top-level fields", async () => {
    const fetchMock = stubFetch(async () => ollamaAnswer("Dining & Coffee"));
    await categorizeWithOllama("QWILLBY NOOK CAFE");
    const { body } = capturedRequest(fetchMock);

    expect(Object.keys(body).sort()).toEqual(["format", "messages", "model", "options", "stream"]);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(messages[1].content).toBe('Transaction description: "QWILLBY NOOK CAFE"');
  });
});
