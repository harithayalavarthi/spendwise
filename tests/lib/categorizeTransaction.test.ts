import { beforeEach, describe, expect, it } from "vitest";
import { categorizeTransaction } from "@/lib/categorizeTransaction";
import { getMerchantKey, saveMerchantCategory } from "@/lib/merchantCache";
import {
  capturedRequest,
  clearMerchantCache,
  merchantCacheRow,
  silenceLogs,
  stubFetch,
  stubOllamaAnswer,
  stubOllamaDown,
} from "../helpers/categorization";

// An invented merchant no keyword rule matches, so it reaches layers 2-4.
const UNKNOWN = "QWILLBY NOOK #48213";
const UNKNOWN_KEY = getMerchantKey(UNKNOWN);

beforeEach(() => {
  clearMerchantCache();
  silenceLogs();
});

describe("categorizeTransaction layer order (CAT-1)", () => {
  it("layer 1: a keyword match wins without touching the cache or the LLM", async () => {
    const fetchMock = stubOllamaAnswer("Travel");
    saveMerchantCategory(getMerchantKey("WAL-MART #1234"), "Travel", "llm");

    await expect(categorizeTransaction("WAL-MART #1234", -42.1)).resolves.toEqual({
      category: "Groceries",
      source: "keyword",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("layer 2: a cached merchant is used without calling the LLM", async () => {
    const fetchMock = stubOllamaAnswer("Travel");
    saveMerchantCategory(UNKNOWN_KEY, "Shopping", "llm");

    await expect(categorizeTransaction(UNKNOWN, -18)).resolves.toEqual({
      category: "Shopping",
      source: "merchant-cache",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("layer 3: the LLM is reached only when keyword and cache both miss, and its answer is cached (CAT-3)", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");

    await expect(categorizeTransaction(UNKNOWN, -18)).resolves.toEqual({ category: "Shopping", source: "llm" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(merchantCacheRow(UNKNOWN_KEY)).toEqual({ category: "Shopping", source: "llm" });
  });

  it("never re-classifies a merchant: the next charge (new ref number) hits the cache (CAT-3)", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");

    await categorizeTransaction("QWILLBY NOOK #48213", -18);
    const second = await categorizeTransaction("QWILLBY NOOK #90077", -22);

    expect(second).toEqual({ category: "Shopping", source: "merchant-cache" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('caches an LLM "Other" answer like any other, and does not apply the amount-sign fallback to it', async () => {
    const fetchMock = stubOllamaAnswer("Other");

    await expect(categorizeTransaction(UNKNOWN, 500)).resolves.toEqual({ category: "Other", source: "llm" });
    expect(merchantCacheRow(UNKNOWN_KEY)).toEqual({ category: "Other", source: "llm" });
    await categorizeTransaction(UNKNOWN, 500);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  describe("layer 4: amount-sign fallback when the LLM gives no answer (CAT-2)", () => {
    it.each([
      [250, "Income"],
      [0.01, "Income"],
      [0, "Other"],
      [-250, "Other"],
    ] as const)("Ollama not running, amount %d -> %s", async (amount, expected) => {
      const fetchMock = stubOllamaDown();
      await expect(categorizeTransaction(UNKNOWN, amount)).resolves.toEqual({ category: expected, source: "fallback" });
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([
      ["HTTP 500", () => stubFetch(async () => new Response("boom", { status: 500 }))],
      ["an unrecognized category", () => stubOllamaAnswer("Pet Supplies")],
    ])("falls back on %s", async (_label, stub) => {
      stub();
      await expect(categorizeTransaction(UNKNOWN, -9)).resolves.toEqual({ category: "Other", source: "fallback" });
    });

    it("does not cache a fallback, so the LLM gets another chance next import", async () => {
      stubOllamaDown();
      await categorizeTransaction(UNKNOWN, -9);
      expect(merchantCacheRow(UNKNOWN_KEY)).toBeUndefined();

      const fetchMock = stubOllamaAnswer("Shopping");
      await expect(categorizeTransaction(UNKNOWN, -9)).resolves.toEqual({ category: "Shopping", source: "llm" });
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });
});

describe("manual corrections (CAT-4)", () => {
  it("a user correction is used on future imports instead of asking the LLM", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    saveMerchantCategory(UNKNOWN_KEY, "Health & Wellness", "user");

    await expect(categorizeTransaction("QWILLBY NOOK #11111", -30)).resolves.toEqual({
      category: "Health & Wellness",
      source: "merchant-cache",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a user correction overrides an earlier LLM guess for the merchant", async () => {
    stubOllamaAnswer("Shopping");
    await categorizeTransaction(UNKNOWN, -30);
    saveMerchantCategory(UNKNOWN_KEY, "Health & Wellness", "user");

    await expect(categorizeTransaction(UNKNOWN, -30)).resolves.toEqual({
      category: "Health & Wellness",
      source: "merchant-cache",
    });
    expect(merchantCacheRow(UNKNOWN_KEY)?.source).toBe("user");
  });

  // BUG (CAT-4): keyword rules run before the merchant cache, so a manual
  // correction for any merchant a keyword rule matches is ignored on every
  // future import — e.g. a user moves "TARGET OPTICAL" from Groceries (keyword
  // "target") to Health & Wellness; the correction is saved to
  // merchant_categories with source "user", but the next import still returns
  // Groceries via the keyword layer. CAT-4 says a correction overrides the
  // cache "for all future imports".
  it.fails("a user correction also wins over a keyword rule on future imports", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    saveMerchantCategory(getMerchantKey("TARGET OPTICAL #0457"), "Health & Wellness", "user");

    const result = await categorizeTransaction("TARGET OPTICAL #0921", -120);
    expect(result.category).toBe("Health & Wellness");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("privacy: what reaches the LLM (NFR-2)", () => {
  it("sends the description to the configured Ollama host and never the amount", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    // A distinctive amount so any leak of it into the body is unambiguous.
    await categorizeTransaction("QWILLBY NOOK", -8347.61);

    expect(fetchMock).toHaveBeenCalledOnce();
    const req = capturedRequest(fetchMock);
    expect(req.url).toBe("http://ollama.test.invalid/api/chat");
    expect(req.rawBody).toContain("QWILLBY NOOK");
    for (const leaked of ["8347", "834761", "8,347", "-8347"]) {
      expect(req.rawBody).not.toContain(leaked);
    }
  });

  it("the request carries no date, account, or institution fields", async () => {
    const fetchMock = stubOllamaAnswer("Shopping");
    await categorizeTransaction("QWILLBY NOOK", -12.34);
    const req = capturedRequest(fetchMock);

    expect(req.rawBody).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/); // ISO date
    expect(req.rawBody).not.toContain("12.34");
    expect(req.rawBody).not.toMatch(/"(amount|date|account|account_number|institution|statement_id)"\s*:/i);
    const userMessages = (req.body.messages as Array<{ role: string; content: string }>).filter((m) => m.role === "user");
    expect(userMessages).toEqual([{ role: "user", content: 'Transaction description: "QWILLBY NOOK"' }]);
    // Only the fetch to Ollama; nothing else goes out.
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual(["ollama.test.invalid"]);
  });
});
