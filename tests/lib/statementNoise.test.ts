import { describe, expect, it } from "vitest";
import { isStatementNoise } from "@/lib/statementNoise";

describe("isStatementNoise (IMP-4)", () => {
  it.each([
    "Opening Balance",
    "Closing Balance",
    "Previous Balance",
    "New Balance",
    "Total New Balance",
    "Beginning Balance",
    "Ending Balance",
    "Balance Forward",
    "Account Balance",
    "Statement Balance",
    "Current Balance",
    "Minimum Payment",
    "Available Credit",
    "Credit Limit",
    "Total",
    "Subtotal",
    "Sub-Total",
  ])("recognizes boilerplate line %j", (line) => {
    expect(isStatementNoise(line)).toBe(true);
  });

  it.each(["OPENING BALANCE", "closing balance", "  Previous Balance  ", "\tTOTAL\n"])(
    "ignores case and surrounding whitespace (%j)",
    (line) => {
      expect(isStatementNoise(line)).toBe(true);
    },
  );

  it.each([
    "TOTAL WINE AND MORE",
    "BALANCE TRANSFER FEE",
    "PAYMENT - THANK YOU",
    "MINIMUM PAYMENT RECEIVED THANK YOU",
    "Opening Balance Adjustment",
    "CREDIT LIMIT INCREASE FEE",
    "NORTHWIND GROCERY",
    "E-TRANSFER TOTAL AUTO",
    "",
  ])("does not flag real transaction %j", (line) => {
    expect(isStatementNoise(line)).toBe(false);
  });
});
