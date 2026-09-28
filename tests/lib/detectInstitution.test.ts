import { describe, expect, it } from "vitest";
import { detectInstitution } from "@/lib/detectInstitution";

describe("detectInstitution (IMP-6)", () => {
  it.each([
    ["Welcome to EasyWeb - TD Canada Trust", "TD Bank"],
    ["TD Cash Back Visa statement", "TD Bank"],
    ["JPMorgan Chase Bank, N.A.", "Chase"],
    ["Bank of America Advantage Banking", "Bank of America"],
    ["WELLS FARGO EVERYDAY CHECKING", "Wells Fargo"],
    ["Capital One Quicksilver", "Capital One"],
    ["RBC Royal Bank chequing", "RBC"],
    ["Scotiabank Transaction History", "Scotiabank"],
    ["The Bank of Nova Scotia", "Scotiabank"],
    ["BMO Bank of Montreal", "BMO"],
    ["CIBC Aventura Visa", "CIBC"],
    ["American Express Cobalt Card", "American Express"],
    ["Discover it Cash Back", "Discover"],
    ["Citibank online", "Citi"],
    ["U.S. Bank Altitude", "US Bank"],
    ["PNC Bank Virtual Wallet", "PNC Bank"],
    ["HSBC Advance", "HSBC"],
    ["Ally Bank savings", "Ally Bank"],
    ["Synchrony Bank", "Synchrony"],
    ["Walmart Rewards Card", "Walmart Credit Card"],
  ])("detects %j as %s", (text, expected) => {
    expect(detectInstitution(text)).toBe(expected);
  });

  it("is case-insensitive and finds the name anywhere in multi-line text", () => {
    const text = "Date,Description,Amount\n2026-01-02,COFFEE,-3.00\n\nStatement issued by scotiaBANK\n";
    expect(detectInstitution(text)).toBe("Scotiabank");
  });

  it.each(["", "Date,Description,Amount\n2026-01-02,NORTHWIND GROCERY,-12.00", "Contoso Credit Union statement"])(
    "returns null for text naming no known institution (%j)",
    (text) => {
      expect(detectInstitution(text)).toBeNull();
    },
  );

  // BUG (new): keyword matching is a plain substring search, and "chase" is a
  // substring of "purchase". Any statement text containing the common word
  // "PURCHASE" is detected as Chase (unless an earlier rule, e.g. TD, hits
  // first) — including a Scotiabank statement, since Chase is checked first.
  it.fails("does not mistake the word 'purchase' for Chase", () => {
    expect(detectInstitution("2026-01-03,POS PURCHASE NORTHWIND GROCERY,-12.00")).toBeNull();
  });

  it.fails("still detects Scotiabank when a row says 'purchase'", () => {
    expect(detectInstitution("Scotiabank\n2026-01-03,POS PURCHASE NORTHWIND GROCERY,-12.00")).toBe("Scotiabank");
  });
});
