import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectRecurringPayments } from "@/lib/recurringPayments";
import { resetDb, seed, series, tx } from "../helpers/analytics";

beforeEach(() => resetDb());

describe("detectRecurringPayments — cadence (DASH-4)", () => {
  it.each([
    { cadence: "weekly", gaps: [7, 7] },
    { cadence: "biweekly", gaps: [14, 14] },
    { cadence: "monthly", gaps: [31, 28, 31] },
    { cadence: "quarterly", gaps: [90, 92] },
    { cadence: "yearly", gaps: [365, 366] },
  ])("detects a $cadence charge from 3+ occurrences", ({ cadence, gaps }) => {
    seed(series("STREAMLY PLUS", -12.99, "2026-01-01", gaps));
    const [payment, ...rest] = detectRecurringPayments();
    expect(rest).toEqual([]);
    expect(payment).toMatchObject({ cadence, merchantKey: "streamly plus", occurrences: gaps.length + 1 });
  });

  it("needs at least 3 charges — two perfectly monthly charges are not recurring", () => {
    seed(series("STREAMLY PLUS", -12.99, "2026-01-01", [30]));
    expect(detectRecurringPayments()).toEqual([]);
  });

  it("rejects an average gap that falls between cadence buckets", () => {
    seed(series("CORNER BAKERY", -8, "2026-01-01", [10, 10, 10]));
    expect(detectRecurringPayments()).toEqual([]);
  });

  it.each([
    { name: "weekly, one gap 2 days off", gaps: [5, 9], recurring: true },
    { name: "weekly, one gap 3 days off", gaps: [4, 10], recurring: false },
    { name: "monthly, one gap 5 days off", gaps: [25, 35], recurring: true },
    { name: "monthly, one gap 6 days off", gaps: [24, 36], recurring: false },
    { name: "monthly on average but wildly irregular", gaps: [5, 55, 30], recurring: false },
  ])("applies the per-gap tolerance: $name", ({ gaps, recurring }) => {
    seed(series("FRESH MARKET CO", -40, "2026-01-01", gaps));
    expect(detectRecurringPayments()).toHaveLength(recurring ? 1 : 0);
  });

  it("groups charges whose descriptions differ only by reference numbers, and reports the latest description", () => {
    seed([
      tx("2026-01-03", "STREAMLY #4821", -9.99, "Subscriptions"),
      tx("2026-02-03", "STREAMLY #5530", -9.99, "Subscriptions"),
      tx("2026-03-03", "STREAMLY #6012", -9.99, "Subscriptions", "Maple Credit Union"),
    ]);
    expect(detectRecurringPayments()).toEqual([
      expect.objectContaining({
        merchantKey: "streamly",
        description: "STREAMLY #6012",
        category: "Subscriptions",
        institution: "Maple Credit Union",
        lastDate: "2026-03-03",
        occurrences: 3,
      }),
    ]);
  });
});

describe("detectRecurringPayments — amount consistency (DASH-4)", () => {
  it.each([
    { name: "±20% of a $100 average (just inside)", amounts: [80, 100, 120], recurring: true },
    { name: "±21% of a $100 average (just outside)", amounts: [79, 100, 121], recurring: false },
    { name: "$3 floor on a $10 average (just inside)", amounts: [7, 10, 13], recurring: true },
    { name: "$3.50 off a $10 average (just outside the floor)", amounts: [6.5, 10, 13.5], recurring: false },
  ])("$name", ({ amounts, recurring }) => {
    seed(series("PEAK FITNESS CLUB", amounts.map((a) => -a), "2026-01-01", [30, 30]));
    expect(detectRecurringPayments()).toHaveLength(recurring ? 1 : 0);
  });

  it("reports the average absolute amount", () => {
    seed(series("PEAK FITNESS CLUB", [-45, -50, -55], "2026-01-01", [30, 30]));
    expect(detectRecurringPayments()[0].averageAmount).toBeCloseTo(50);
  });
});

describe("detectRecurringPayments — what counts", () => {
  it("excludes Transfers even when they recur like clockwork (DASH-6)", () => {
    seed(series("SAVINGS SWEEP", -500, "2026-01-01", [30, 30], "Transfers"));
    expect(detectRecurringPayments()).toEqual([]);
  });

  it("ignores income (positive amounts)", () => {
    seed(series("ACME PAYROLL", 2500, "2026-01-01", [14, 14], "Income"));
    expect(detectRecurringPayments()).toEqual([]);
  });

  it("returns nothing for an empty database", () => {
    expect(detectRecurringPayments()).toEqual([]);
  });
});

describe("detectRecurringPayments — status (DASH-4)", () => {
  afterEach(() => vi.useRealTimers());

  // Charges on Jan 1, Jan 31, Mar 2 (gaps 30, 30): next expected Apr 1, grace
  // window round(30 * 0.25) = 8 days. The "as of" date is moved by a one-off
  // unrelated expense, since status is measured against the latest expense in
  // the data, not today.
  const monthly = () => series("CLOUDBOX STORAGE", -11.99, "2026-01-01", [30, 30]);

  it.each([
    { asOf: null, daysOverdue: -30, status: "on-track" },
    { asOf: "2026-03-24", daysOverdue: -8, status: "on-track" },
    { asOf: "2026-03-25", daysOverdue: -7, status: "due-soon" },
    { asOf: "2026-04-01", daysOverdue: 0, status: "due-soon" },
    { asOf: "2026-04-09", daysOverdue: 8, status: "due-soon" },
    { asOf: "2026-04-10", daysOverdue: 9, status: "missed" },
  ])("latest expense $asOf → $status ($daysOverdue days)", ({ asOf, daysOverdue, status }) => {
    seed([...monthly(), ...(asOf ? [tx(asOf, "ONE-OFF HARDWARE STORE", -25)] : [])]);
    expect(detectRecurringPayments()[0]).toMatchObject({ expectedNextDate: "2026-04-01", daysOverdue, status });
  });

  // Weekly: round(7 * 0.25) = 2, so the 3-day minimum grace applies.
  // Charges Jan 5, 12, 19 → next expected Jan 26.
  it.each([
    { asOf: "2026-01-23", status: "on-track" }, // -3
    { asOf: "2026-01-24", status: "due-soon" }, // -2
    { asOf: "2026-01-29", status: "due-soon" }, // +3
    { asOf: "2026-01-30", status: "missed" }, // +4
  ])("weekly grace floors at 3 days: latest expense $asOf → $status", ({ asOf, status }) => {
    seed([...series("GREENBOX MEALS", -60, "2026-01-05", [7, 7]), tx(asOf, "ONE-OFF HARDWARE STORE", -25)]);
    expect(detectRecurringPayments()[0].status).toBe(status);
  });

  it("scales the grace window with the cadence (yearly allows ~91 days)", () => {
    // Expected 2027-01-01 (avg gap 365), grace round(365 * 0.25) = 91.
    seed([...series("DOMAINHOST RENEWAL", -20, "2024-01-02", [365, 365]), tx("2027-04-02", "ONE-OFF HARDWARE STORE", -25)]);
    expect(detectRecurringPayments()[0]).toMatchObject({ daysOverdue: 91, status: "due-soon" });
  });

  it("measures against the latest expense, not later income or transfers", () => {
    seed([
      ...monthly(),
      tx("2026-06-01", "ACME PAYROLL", 2500, "Income"),
      tx("2026-06-01", "SAVINGS SWEEP", -500, "Transfers"),
    ]);
    expect(detectRecurringPayments()[0]).toMatchObject({ daysOverdue: -30, status: "on-track" });
  });

  it("does not depend on the real clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
    seed(monthly());
    expect(detectRecurringPayments()[0].status).toBe("on-track");
  });
});

describe("detectRecurringPayments — sort order", () => {
  it("lists missed payments first, then due-soon, then on-track, larger amounts first within a status", () => {
    // Latest expense in the data: 2026-06-30.
    seed([
      ...series("SMALL MISSED APP", -10, "2026-03-02", [30, 30]), // last May 1 → missed
      ...series("BIG MISSED GYM", -30, "2026-03-02", [30, 30]), // last May 1 → missed
      ...series("DUE SOON INSURER", -100, "2026-04-02", [30, 30]), // last Jun 1 → due Jul 1
      ...series("ON TRACK PHONE", -50, "2026-04-29", [30, 30]), // last Jun 28 → due Jul 28
      ...series("ON TRACK MUSIC", -80, "2026-04-29", [30, 30]),
      tx("2026-06-30", "ONE-OFF HARDWARE STORE", -25),
    ]);
    expect(detectRecurringPayments().map((p) => [p.description, p.status])).toEqual([
      ["BIG MISSED GYM", "missed"],
      ["SMALL MISSED APP", "missed"],
      ["DUE SOON INSURER", "due-soon"],
      ["ON TRACK MUSIC", "on-track"],
      ["ON TRACK PHONE", "on-track"],
    ]);
  });
});
