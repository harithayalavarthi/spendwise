import { beforeEach, describe, expect, it } from "vitest";
import { getMerchantKey, lookupMerchantCategory, saveMerchantCategory } from "@/lib/merchantCache";
import { clearMerchantCache, merchantCacheRow } from "../helpers/categorization";

describe("getMerchantKey", () => {
  it.each([
    ["QWILLBY NOOK", "qwillby nook"],
    ["  Qwillby   Nook  ", "qwillby nook"], // whitespace collapsed and trimmed
    ["QWILLBY NOOK #48213", "qwillby nook"], // store/ref number with '#'
    ["QWILLBY NOOK 0042", "qwillby nook"], // 3+ digit run stripped
    ["QWILLBY NOOK 12", "qwillby nook 12"], // short digit runs are kept
    ["PIER 39 KITE CO", "pier 39 kite co"],
    ["O'MALLEY-BRUN BAKERY.", "omalleybrun bakery"], // . ' - removed like keyword matching
    ["REF 2026-03-14 QWILLBY NOOK", "ref qwillby nook"], // ISO date collapses into one digit run
  ])("%j -> %j", (description, key) => {
    expect(getMerchantKey(description)).toBe(key);
  });

  it("gives recurring charges from one merchant the same key", () => {
    const keys = ["QWILLBY NOOK #10021", "Qwillby Nook 55530", "QWILLBY  NOOK 900001"].map(getMerchantKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("reduces a bare reference number to an empty key", () => {
    expect(getMerchantKey("#48213")).toBe("");
    expect(getMerchantKey("  123456 ")).toBe("");
  });

  // Possible bug: the comment on getMerchantKey says charges with "different
  // ... dates" should hit the same cache entry, but a short MM/DD date (the
  // form most statements print inside a description) is made of 2-digit runs,
  // which the /#?\d{3,}/ strip leaves in place — so each month's charge gets
  // its own key and triggers a fresh LLM call.
  it.fails("gives the same key to one merchant's charges on different MM/DD dates", () => {
    expect(getMerchantKey("QWILLBY NOOK 03/14")).toBe(getMerchantKey("QWILLBY NOOK 04/14"));
  });
});

describe("merchant_categories read/write", () => {
  beforeEach(() => {
    clearMerchantCache();
  });

  it("returns null for an unknown merchant", () => {
    expect(lookupMerchantCategory("qwillby nook")).toBeNull();
  });

  it("round-trips a saved category and records its source", () => {
    saveMerchantCategory("qwillby nook", "Shopping", "llm");
    expect(lookupMerchantCategory("qwillby nook")).toBe("Shopping");
    expect(merchantCacheRow("qwillby nook")).toEqual({ category: "Shopping", source: "llm" });
  });

  it("ignores an empty merchant key on both read and write", () => {
    saveMerchantCategory("", "Shopping", "user");
    expect(lookupMerchantCategory("")).toBeNull();
    expect(merchantCacheRow("")).toBeUndefined();
  });

  describe("write precedence (CAT-4)", () => {
    it.each([
      // [first write, second write, expected row]
      [["Shopping", "llm"], ["Travel", "llm"], { category: "Travel", source: "llm" }],
      [["Shopping", "llm"], ["Travel", "user"], { category: "Travel", source: "user" }],
      [["Shopping", "user"], ["Travel", "llm"], { category: "Shopping", source: "user" }],
      [["Shopping", "user"], ["Travel", "user"], { category: "Travel", source: "user" }],
    ] as const)("%j then %j -> %j", (first, second, expected) => {
      saveMerchantCategory("zorvex holloway", first[0], first[1]);
      saveMerchantCategory("zorvex holloway", second[0], second[1]);
      expect(merchantCacheRow("zorvex holloway")).toEqual(expected);
      expect(lookupMerchantCategory("zorvex holloway")).toBe(expected.category);
    });
  });
});
