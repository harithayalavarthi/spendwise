import { beforeEach, describe, expect, it } from "vitest";
import { getAnalytics, type Suggestion } from "@/lib/insights";
import { resetDb, seed, series, tx } from "../helpers/analytics";

beforeEach(() => resetDb());

const titles = (suggestions: Suggestion[]) => suggestions.map((s) => s.title);
const find = (pattern: RegExp) => getAnalytics().suggestions.filter((s) => pattern.test(s.title));

describe("getAnalytics — totals (DASH-1, DASH-6)", () => {
  it("returns sensible empty results for an empty database", () => {
    expect(getAnalytics()).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      netSavings: 0,
      savingsRate: null,
      categoryTotals: [],
      monthlyTotals: [],
      suggestions: [],
      transactionCount: 0,
    });
  });

  it("computes income, expense, net, and savings rate with Transfers excluded everywhere", () => {
    seed([
      tx("2026-02-01", "ACME PAYROLL", 3000, "Income"),
      tx("2026-02-03", "FRESH MARKET CO", -500, "Groceries"),
      tx("2026-02-05", "OAKWOOD APARTMENTS", -1000, "Housing"),
      tx("2026-02-10", "CARD PAYMENT THANK YOU", 700, "Transfers"),
      tx("2026-02-10", "ONLINE TRANSFER TO SAVINGS", -700, "Transfers"),
    ]);
    const a = getAnalytics();
    expect(a).toMatchObject({ totalIncome: 3000, totalExpense: 1500, netSavings: 1500, savingsRate: 0.5 });
    expect(a.categoryTotals.map((c) => c.category)).not.toContain("Transfers");
    expect(a.monthlyTotals).toEqual([{ month: "2026-02", income: 3000, expense: 1500, net: 1500 }]);
    // transactionCount is the raw row count (it includes the two transfers).
    expect(a.transactionCount).toBe(5);
  });

  it("has a null savings rate when there is no income", () => {
    seed([tx("2026-02-03", "FRESH MARKET CO", -50, "Groceries")]);
    expect(getAnalytics().savingsRate).toBeNull();
  });

  it("totals expenses per category, largest first, with counts", () => {
    seed([
      tx("2026-02-03", "FRESH MARKET CO", -50.25, "Groceries"),
      tx("2026-02-09", "FRESH MARKET CO", -30.5, "Groceries"),
      tx("2026-02-04", "OAKWOOD APARTMENTS", -1000, "Housing"),
      tx("2026-02-06", "BEANERY CAFE", -4.75, "Dining"),
      tx("2026-02-07", "ACME PAYROLL", 2000, "Income"),
    ]);
    const totals = getAnalytics().categoryTotals;
    expect(totals.map((c) => [c.category, c.count])).toEqual([["Housing", 1], ["Groceries", 2], ["Dining", 1]]);
    expect(totals[1].total).toBeCloseTo(80.75);
  });

  it("totals income and expense per month, oldest first", () => {
    seed([
      tx("2026-03-15", "ACME PAYROLL", 2000, "Income"),
      tx("2026-03-20", "FRESH MARKET CO", -400, "Groceries"),
      tx("2026-01-15", "ACME PAYROLL", 1800, "Income"),
      tx("2026-01-20", "FRESH MARKET CO", -2000, "Groceries"),
      tx("2026-01-25", "ONLINE TRANSFER TO SAVINGS", -900, "Transfers"),
    ]);
    expect(getAnalytics().monthlyTotals).toEqual([
      { month: "2026-01", income: 1800, expense: 2000, net: -200 },
      { month: "2026-03", income: 2000, expense: 400, net: 1600 },
    ]);
  });
});

describe("suggestions — top category share (DASH-5)", () => {
  it.each([
    { name: "34% → nothing", spend: [34, 33, 33], severity: null },
    { name: "35% → warning", spend: [35, 33, 32], severity: "warning" },
    { name: "49% → warning", spend: [49, 26, 25], severity: "warning" },
    { name: "50% → critical", spend: [50, 25, 25], severity: "critical" },
  ])("$name", ({ spend, severity }) => {
    const [top, ...rest] = spend;
    seed([
      tx("2026-02-02", "OAKWOOD APARTMENTS", -top, "Housing"),
      tx("2026-02-03", "FRESH MARKET CO", -rest[0], "Groceries"),
      tx("2026-02-04", "BEANERY CAFE", -rest[1], "Dining"),
    ]);
    const hits = find(/eating your budget/);
    if (severity === null) {
      expect(hits).toEqual([]);
    } else {
      expect(hits).toEqual([expect.objectContaining({ title: "Housing is eating your budget", severity })]);
      expect(hits[0].detail).toContain(`${top}%`);
    }
  });
});

describe("suggestions — month-over-month spike (DASH-5)", () => {
  it.each([
    { prev: 100, last: 121, fires: true },
    { prev: 100, last: 120, fires: false }, // exactly +20% is not "more than"
    { prev: 20, last: 25, fires: true },
    { prev: 19.99, last: 500, fires: false }, // prior month too small to compare
  ])("previous $prev → latest $last: fires=$fires", ({ prev, last, fires }) => {
    seed([
      tx("2026-02-10", "BEANERY CAFE", -prev, "Dining"),
      tx("2026-03-10", "BEANERY CAFE", -last, "Dining"),
    ]);
    expect(titles(find(/jumped/))).toEqual(fires ? ["Dining spending jumped this month"] : []);
  });

  it("compares only the two most recent months and ignores Transfers", () => {
    seed([
      tx("2026-01-10", "BEANERY CAFE", -20, "Dining"),
      tx("2026-02-10", "BEANERY CAFE", -100, "Dining"),
      tx("2026-03-10", "BEANERY CAFE", -100, "Dining"),
      tx("2026-02-12", "ONLINE TRANSFER TO SAVINGS", -100, "Transfers"),
      tx("2026-03-12", "ONLINE TRANSFER TO SAVINGS", -900, "Transfers"),
    ]);
    expect(find(/jumped/)).toEqual([]);
  });

  it("needs at least two months of data", () => {
    seed([tx("2026-03-01", "BEANERY CAFE", -5, "Dining"), tx("2026-03-30", "BEANERY CAFE", -500, "Dining")]);
    expect(find(/jumped/)).toEqual([]);
  });
});

describe("suggestions — savings rate bands (DASH-5, DASH-6)", () => {
  const SAVINGS = /more than you earn|Savings rate is thin|Healthy savings rate/;

  it.each([
    { expense: 1100, expected: [{ title: "You're spending more than you earn", severity: "critical" }] },
    { expense: 950, expected: [{ title: "Savings rate is thin", severity: "warning" }] },
    { expense: 900, expected: [] }, // exactly 10%: neither thin nor healthy
    { expense: 850, expected: [] },
    { expense: 800, expected: [{ title: "Healthy savings rate", severity: "info" }] }, // exactly 20%
  ])("income 1000, expenses $expense", ({ expense, expected }) => {
    seed([
      tx("2026-02-01", "ACME PAYROLL", 1000, "Income"),
      tx("2026-02-03", "OAKWOOD APARTMENTS", -expense, "Housing"),
    ]);
    expect(find(SAVINGS).map(({ title, severity }) => ({ title, severity }))).toEqual(expected);
  });

  it("does not let a transfer tip the savings rate", () => {
    seed([
      tx("2026-02-01", "ACME PAYROLL", 1000, "Income"),
      tx("2026-02-03", "OAKWOOD APARTMENTS", -800, "Housing"),
      tx("2026-02-04", "ONLINE TRANSFER TO SAVINGS", -5000, "Transfers"),
    ]);
    expect(titles(find(SAVINGS))).toEqual(["Healthy savings rate"]);
  });

  it("says nothing about savings when there is no income", () => {
    seed([tx("2026-02-03", "OAKWOOD APARTMENTS", -800, "Housing")]);
    expect(find(SAVINGS)).toEqual([]);
  });
});

describe("suggestions — subscriptions (DASH-5)", () => {
  it("summarizes Subscriptions spend and charge count", () => {
    seed([
      tx("2026-02-03", "STREAMLY PLUS", -12.5, "Subscriptions"),
      tx("2026-02-17", "CLOUDBOX STORAGE", -2.5, "Subscriptions"),
    ]);
    const [s] = find(/subscriptions/);
    expect(s).toMatchObject({ title: "Review recurring subscriptions", severity: "info" });
    expect(s.detail).toContain("$15.00 across 2 subscription charges");
  });

  it("uses the singular for one charge", () => {
    seed([tx("2026-02-03", "STREAMLY PLUS", -12.5, "Subscriptions")]);
    expect(find(/subscriptions/)[0].detail).toContain("across 1 subscription charge.");
  });

  it("is absent without Subscriptions spending", () => {
    seed([tx("2026-02-03", "FRESH MARKET CO", -40, "Groceries")]);
    expect(find(/subscriptions/)).toEqual([]);
  });
});

describe("suggestions — missed recurring payments (DASH-4, DASH-5)", () => {
  // Monthly charges ending May 1 (next expected May 31); a one-off expense on
  // Jun 30 makes them 30 days overdue → "missed".
  const missed = (description: string, amount: number) => series(description, -amount, "2026-03-02", [30, 30], "Utilities & Bills");
  const LATEST = tx("2026-06-30", "ONE-OFF HARDWARE STORE", -1, "Shopping");

  it("surfaces at most 3 missed payments, largest first", () => {
    seed([
      ...missed("RIVERSIDE WATER", 40),
      ...missed("BRIGHTSPARK ENERGY", 90),
      ...missed("HILLTOP INTERNET", 60),
      ...missed("PARKLANE PARKING", 20),
      LATEST,
    ]);
    const hits = find(/may have been missed/);
    expect(titles(hits)).toEqual([
      "BRIGHTSPARK ENERGY may have been missed",
      "HILLTOP INTERNET may have been missed",
      "RIVERSIDE WATER may have been missed",
    ]);
    expect(hits.every((s) => s.severity === "warning")).toBe(true);
    expect(hits[0].detail).toContain("~$90.00 every month, last seen 2026-05-01, expected around 2026-05-31 — 30 days overdue");
  });

  it("stays quiet for recurring payments that are on track or due soon", () => {
    seed([...missed("RIVERSIDE WATER", 40), tx("2026-05-20", "ONE-OFF HARDWARE STORE", -1, "Shopping")]);
    expect(find(/may have been missed/)).toEqual([]);
  });

  // BUG: only "monthly" is turned into a noun — every other cadence is pasted
  // in as an adjective, so the detail reads "every weekly" / "every quarterly"
  // / "every yearly". Should read "every week" (and "every 2 weeks", etc.).
  it.fails("describes a non-monthly cadence in plain words", () => {
    seed([...series("GREENBOX MEALS", -60, "2026-01-05", [7, 7], "Groceries"), tx("2026-02-20", "ONE-OFF HARDWARE STORE", -1, "Shopping")]);
    const [s] = find(/may have been missed/);
    expect(s.detail).toContain("every week,");
  });
});
