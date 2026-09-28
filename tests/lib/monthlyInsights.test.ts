import { beforeEach, describe, expect, it } from "vitest";
import {
  getAvailableMonths,
  getDayOfWeekPattern,
  getKnownInstitutions,
  getMonthDetail,
  getMonthlyInstitutionBreakdown,
  getTopSpendingDays,
} from "@/lib/monthlyInsights";
import { resetDb, seed, tx } from "../helpers/analytics";

beforeEach(() => resetDb());

const MAPLE = "Maple Credit Union";
const HARBOR = "Harbor Card Co";

describe("empty database", () => {
  it("returns empty results", () => {
    expect(getMonthlyInstitutionBreakdown()).toEqual([]);
    expect(getKnownInstitutions()).toEqual([]);
    expect(getAvailableMonths()).toEqual([]);
    expect(getMonthDetail("2026-02")).toBeNull();
    expect(getTopSpendingDays()).toEqual([]);
    expect(getDayOfWeekPattern().every((d) => d.total === 0 && d.count === 0 && d.average === 0)).toBe(true);
  });
});

describe("getMonthlyInstitutionBreakdown (DASH-1)", () => {
  it("totals spending per month per institution, excluding income and Transfers", () => {
    seed([
      tx("2026-01-05", "FRESH MARKET CO", -40, "Groceries", MAPLE),
      tx("2026-01-06", "BEANERY CAFE", -10, "Dining", MAPLE),
      tx("2026-01-07", "GADGET BARN", -200, "Shopping", HARBOR),
      tx("2026-01-08", "ACME PAYROLL", 3000, "Income", MAPLE),
      tx("2026-01-09", "CARD PAYMENT", -500, "Transfers", MAPLE),
      tx("2026-02-03", "FRESH MARKET CO", -60, "Groceries", MAPLE),
      tx("2026-02-04", "CASH MARKET", -15, "Groceries", null),
    ]);
    expect(getMonthlyInstitutionBreakdown()).toEqual([
      { month: "2026-01", [MAPLE]: 50, [HARBOR]: 200 },
      { month: "2026-02", [MAPLE]: 60, Unknown: 15 },
    ]);
  });
});

describe("getKnownInstitutions", () => {
  it("lists each institution once, in first-seen order, skipping nulls", () => {
    seed([
      tx("2026-03-01", "GADGET BARN", -5, "Shopping", HARBOR),
      tx("2026-01-01", "FRESH MARKET CO", -5, "Groceries", MAPLE),
      tx("2026-01-02", "CASH MARKET", -5, "Groceries", null),
      tx("2026-01-03", "GADGET BARN", -6, "Shopping", HARBOR),
    ]);
    expect(getKnownInstitutions()).toEqual([HARBOR, MAPLE]);
  });
});

describe("getAvailableMonths (DASH-2)", () => {
  it("lists distinct months, newest first", () => {
    seed([
      tx("2026-01-05", "FRESH MARKET CO", -40, "Groceries"),
      tx("2026-03-05", "FRESH MARKET CO", -40, "Groceries"),
      tx("2026-03-20", "ACME PAYROLL", 1000, "Income"),
      tx("2026-02-05", "FRESH MARKET CO", -40, "Groceries"),
    ]);
    expect(getAvailableMonths()).toEqual(["2026-03", "2026-02", "2026-01"]);
  });
});

describe("getMonthDetail (DASH-2, DASH-6)", () => {
  beforeEach(() => {
    seed([
      tx("2026-02-01", "ACME PAYROLL", 2500, "Income", MAPLE),
      tx("2026-02-02", "OAKWOOD APARTMENTS", -1200, "Housing", MAPLE),
      tx("2026-02-03", "FRESH MARKET CO", -80, "Groceries", HARBOR),
      tx("2026-02-10", "FRESH MARKET CO", -70, "Groceries", null),
      tx("2026-02-15", "CARD PAYMENT THANK YOU", 400, "Transfers", HARBOR),
      tx("2026-02-15", "CARD PAYMENT", -400, "Transfers", MAPLE),
      tx("2026-03-01", "FRESH MARKET CO", -999, "Groceries", MAPLE),
    ]);
  });

  it("breaks one month down by category and institution, with Transfers excluded", () => {
    expect(getMonthDetail("2026-02")).toEqual({
      month: "2026-02",
      income: 2500,
      expense: 1350,
      net: 1150,
      transactionCount: 6, // raw row count for the month, transfers included
      categoryTotals: [
        { category: "Housing", total: 1200, count: 1 },
        { category: "Groceries", total: 150, count: 2 },
      ],
      institutionTotals: [
        { institution: MAPLE, total: 1200 },
        { institution: HARBOR, total: 80 },
        { institution: "Unknown", total: 70 },
      ],
    });
  });

  it("returns null for a month with no transactions", () => {
    expect(getMonthDetail("2026-04")).toBeNull();
  });
});

describe("getTopSpendingDays (DASH-3)", () => {
  beforeEach(() => {
    seed([
      tx("2026-02-01", "GADGET BARN", -300, "Shopping"),
      tx("2026-02-01", "BEANERY CAFE", -5, "Dining"),
      tx("2026-02-02", "FRESH MARKET CO", -120, "Groceries"),
      tx("2026-02-03", "BEANERY CAFE", -4, "Dining"),
      tx("2026-02-03", "CARD PAYMENT", -2000, "Transfers"),
      tx("2026-02-04", "ACME PAYROLL", 5000, "Income"),
    ]);
  });

  it("ranks days by total spending, excluding Transfers and income", () => {
    expect(getTopSpendingDays().map((d) => [d.date, d.total, d.transactionCount])).toEqual([
      ["2026-02-01", 305, 2],
      ["2026-02-02", 120, 1],
      ["2026-02-03", 4, 1],
    ]);
  });

  it("respects the limit", () => {
    expect(getTopSpendingDays(1).map((d) => d.date)).toEqual(["2026-02-01"]);
  });

  // BUG: the top-transaction query selects `-amount AS amount` and then
  // `ORDER BY amount ASC`. SQLite resolves ORDER BY `amount` to the output
  // alias (the positive value), so it picks the day's *smallest* expense —
  // here the $5 coffee instead of the $300 purchase.
  it.fails("names the day's largest expense as its top transaction", () => {
    expect(getTopSpendingDays()[0]).toMatchObject({ topDescription: "GADGET BARN", topAmount: 300 });
  });
});

describe("getDayOfWeekPattern (DASH-3)", () => {
  it("returns Sun..Sat with totals, counts, and averages, excluding Transfers and income", () => {
    seed([
      tx("2026-01-04", "BEANERY CAFE", -10, "Dining"), // Sunday
      tx("2026-01-11", "BEANERY CAFE", -20, "Dining"), // Sunday
      tx("2026-01-05", "FRESH MARKET CO", -90, "Groceries"), // Monday
      tx("2026-01-05", "CARD PAYMENT", -1000, "Transfers"), // Monday, excluded
      tx("2026-01-09", "ACME PAYROLL", 2000, "Income"), // Friday, excluded
    ]);
    const pattern = getDayOfWeekPattern();
    expect(pattern.map((d) => d.dayOfWeek)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(pattern[0]).toEqual({ dayOfWeek: "Sun", total: 30, average: 15, count: 2 });
    expect(pattern[1]).toEqual({ dayOfWeek: "Mon", total: 90, average: 90, count: 1 });
    expect(pattern[5]).toEqual({ dayOfWeek: "Fri", total: 0, average: 0, count: 0 });
  });
});
