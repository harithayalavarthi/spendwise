import { describe, expect, it } from "vitest";
import { CATEGORIES, categorize, categorizeByKeyword } from "@/lib/categories";

describe("categorizeByKeyword (CAT-1, layer 1)", () => {
  it.each([
    ["WALMART SUPERCENTER #5521", "Groceries"],
    ["STARBUCKS STORE 00123", "Dining & Coffee"],
    ["LYFT *RIDE TUE 8PM", "Transport"],
    ["NETFLIX.COM", "Subscriptions"],
    ["ACME PAYROLL DIRECT DEP", "Income"],
    ["ZELLE PAYMENT TO J DOE", "Transfers"],
    ["OVERDRAFT FEE", "Fees & Charges"],
  ])("matches %j -> %s", (description, expected) => {
    expect(categorizeByKeyword(description)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(categorizeByKeyword("netflix.com")).toBe("Subscriptions");
    expect(categorizeByKeyword("NeTfLiX")).toBe("Subscriptions");
  });

  // Punctuation that varies by formatting but not meaning is stripped from both
  // the description and the keyword before matching.
  it.each([
    ["WAL-MART #1234", "Groceries"], // keyword "walmart"
    ["Wal.Mart Store", "Groceries"],
    ["MCDONALD'S F1234", "Dining & Coffee"], // keyword "mcdonald"
    ["TRADER JOE'S #552", "Groceries"], // keyword "trader joe"
    ["T-MOBILE AUTOPAY", "Utilities & Bills"], // keyword "t-mobile", listed above Transfers' "autopay"
    ["APPLE.COM/BILL", "Subscriptions"], // keyword "apple.com/bill"
  ])("matches punctuation variant %j -> %s", (description, expected) => {
    expect(categorizeByKeyword(description)).toBe(expected);
  });

  // First matching rule wins, so branded keywords must sit above generic ones.
  it.each([
    ["AMAZON PRIME*AB12C", "Subscriptions"],
    ["AMAZON MKTPLACE PMTS", "Shopping"],
    ["UBER EATS ORDER", "Dining & Coffee"],
    ["UBER TRIP HELP.UBER.COM", "Transport"],
  ])("rule order: %j -> %s", (description, expected) => {
    expect(categorizeByKeyword(description)).toBe(expected);
  });

  it.each(["QWILLBY NOOK 48213", "ZORVEX HOLLOWAY", "", "   "])(
    "returns null (not a fallback) when nothing matches: %j",
    (description) => {
      expect(categorizeByKeyword(description)).toBeNull();
    },
  );

  it("only ever returns a known category", () => {
    for (const d of ["WALMART", "NETFLIX", "RENT PAYMENT", "CINEMA 9"]) {
      expect(CATEGORIES).toContain(categorizeByKeyword(d));
    }
  });
});

describe("categorize (synchronous keyword + amount-sign fallback)", () => {
  it.each([
    ["WALMART", -20, "Groceries"],
    ["WALMART", 20, "Groceries"], // a refund keeps the merchant's category
    ["QWILLBY NOOK", 250, "Income"],
    ["QWILLBY NOOK", -250, "Other"],
    ["QWILLBY NOOK", 0, "Other"],
  ] as const)("%j with amount %d -> %s", (description, amount, expected) => {
    expect(categorize(description, amount)).toBe(expected);
  });
});
