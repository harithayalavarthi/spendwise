import { describe, expect, it } from "vitest";
import { transactionHash } from "@/lib/dedupe";

describe("transactionHash (IMP-5)", () => {
  it("is stable for the same date, description, and amount", () => {
    expect(transactionHash("2026-01-05", "COFFEE SHOP", -4.5)).toBe(transactionHash("2026-01-05", "COFFEE SHOP", -4.5));
  });

  it("ignores case and surrounding whitespace in the description", () => {
    expect(transactionHash("2026-01-05", "  Coffee Shop ", -4.5)).toBe(transactionHash("2026-01-05", "COFFEE SHOP", -4.5));
  });

  it("treats amounts equal to the cent as the same", () => {
    expect(transactionHash("2026-01-05", "X", -4.5)).toBe(transactionHash("2026-01-05", "X", -4.499999));
  });

  it("differs when any field differs", () => {
    const base = transactionHash("2026-01-05", "COFFEE SHOP", -4.5);
    expect(transactionHash("2026-01-06", "COFFEE SHOP", -4.5)).not.toBe(base);
    expect(transactionHash("2026-01-05", "TEA SHOP", -4.5)).not.toBe(base);
    expect(transactionHash("2026-01-05", "COFFEE SHOP", 4.5)).not.toBe(base);
  });
});
