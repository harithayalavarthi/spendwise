import { afterEach, describe, expect, it } from "vitest";
import { parseAmountToken, parseDateToken, parseStatementCsv } from "@/lib/parseStatement";
import { readCsvFixture } from "../helpers/csv";

describe("parseAmountToken (IMP-1, IMP-7)", () => {
  it.each([
    ["-4.75", -4.75],
    ["12", 12],
    ["0.00", 0],
    ["$1,234.56", 1234.56],
    ["1,234,567.89", 1234567.89],
    ["-$45.00", -45],
    ["$-45.00", -45],
    ["(45.00)", -45],
    ["($1,045.00)", -1045],
    ["  82.10  ", 82.1],
    ["CAD 19.99", 19.99],
  ])("parses %j as %d", (raw, expected) => {
    expect(parseAmountToken(raw)).toBe(expected);
  });

  it.each([undefined, "", "   ", "-", "abc", "N/A", "1-2"])("returns undefined for %j", (raw) => {
    expect(parseAmountToken(raw)).toBeUndefined();
  });
});

describe("parseDateToken (IMP-1)", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each([
    ["2026-01-05", "2026-01-05"],
    [" 2026-01-05 ", "2026-01-05"],
    ["2026-12-31", "2026-12-31"],
  ])("keeps ISO date %j as %s", (raw, expected) => {
    expect(parseDateToken(raw)).toBe(expected);
  });

  // Non-ISO formats go through the JS Date parser as local time; pin to a
  // UTC-negative zone (where the owner runs the app) so these are deterministic.
  it.each([
    ["01/05/2026", "2026-01-05"],
    ["Jan 5, 2026", "2026-01-05"],
    ["5 Jan 2026", "2026-01-05"],
    ["2026/01/05", "2026-01-05"],
  ])("normalizes %j to %s (America/Toronto)", (raw, expected) => {
    process.env.TZ = "America/Toronto";
    expect(parseDateToken(raw)).toBe(expected);
  });

  it.each(["31/01/2026", "20260105", "not a date", ""])("returns unparseable %j unchanged (trimmed)", (raw) => {
    expect(parseDateToken(`  ${raw}  `)).toBe(raw);
  });

  // BUG (new): non-ISO dates are parsed as local midnight and then converted
  // with toISOString() (UTC), so anywhere east of UTC every such date lands on
  // the previous day — "01/05/2026" in Asia/Tokyo becomes "2026-01-04".
  it.fails("does not shift non-ISO dates by a day in time zones east of UTC", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(parseDateToken("01/05/2026")).toBe("2026-01-05");
  });

  // BUG (new): impossible calendar dates roll over instead of being rejected —
  // "2026-02-30" silently becomes "2026-03-02" rather than staying raw.
  it.fails("does not roll impossible dates over into the next month", () => {
    expect(parseDateToken("2026-02-30")).toBe("2026-02-30");
  });
});

describe("parseStatementCsv — single amount column (IMP-1)", () => {
  // Imitates a generic bank export: Date, Description, signed Amount.
  const result = parseStatementCsv(readCsvFixture("csv-single-amount.csv"));

  it("keeps real transactions with their sign, in file order", () => {
    expect(result.transactions).toEqual([
      { date: "2026-03-02", description: "MAPLE LEAF COFFEE", amount: -4.75 },
      { date: "2026-03-03", description: "ACME PAYROLL DEPOSIT", amount: 2500 },
      { date: "2026-03-05", description: "NORTHWIND GROCERY", amount: -82.1 },
    ]);
  });

  it("counts boilerplate, missing-date, missing-description, and blank-amount rows as skipped (IMP-4)", () => {
    expect(result.skippedRows).toBe(4);
    expect(result.warning).toBeUndefined();
  });

  it("reports no institution when the file doesn't name one (IMP-6)", () => {
    expect(result.detectedInstitution).toBeNull();
  });
});

describe("parseStatementCsv — column auto-detection (IMP-1)", () => {
  it.each([
    ["Date", "Description", "Amount"],
    ["Transaction Date", "Narrative", "Transaction Amount"],
    ["Posted Date", "Memo", "Value"],
    ["Posting Date", "Payee", "Amount"],
    ["Trans Date", "Merchant", "Amount"],
    ["  DATE ", " Transaction   Details ", " AMOUNT "],
    ["Date Posted", "Merchant Name", "Amount (CAD)"],
  ])("recognizes headers %j / %j / %j", (dateH, descH, amountH) => {
    const csv = `"${dateH}","${descH}","${amountH}"\n2026-02-10,ADVENTURE WORKS,-15.00\n`;
    expect(parseStatementCsv(csv).transactions).toEqual([
      { date: "2026-02-10", description: "ADVENTURE WORKS", amount: -15 },
    ]);
  });

  it("finds columns regardless of order and ignores unrelated ones", () => {
    const csv = "Amount,Reference,Description,Date\n-9.99,REF123,STREAMCO MONTHLY,2026-02-11\n";
    expect(parseStatementCsv(csv).transactions).toEqual([
      { date: "2026-02-11", description: "STREAMCO MONTHLY", amount: -9.99 },
    ]);
  });

  it("handles a UTF-8 byte-order mark before the first header", () => {
    const csv = "﻿Date,Description,Amount\n2026-02-12,BLUE YONDER AIR,-300.00\n";
    expect(parseStatementCsv(csv).transactions).toHaveLength(1);
  });

  it("handles CRLF line endings and quoted descriptions containing commas", () => {
    const csv = 'Date,Description,Amount\r\n2026-02-13,"LUCERNE DAIRY, STORE 4",-6.40\r\n';
    expect(parseStatementCsv(csv).transactions).toEqual([
      { date: "2026-02-13", description: "LUCERNE DAIRY, STORE 4", amount: -6.4 },
    ]);
  });

  it("trims whitespace around descriptions", () => {
    const csv = "Date,Description,Amount\n2026-02-14,   PROSEWARE BOOKS   ,-12.00\n";
    expect(parseStatementCsv(csv).transactions[0].description).toBe("PROSEWARE BOOKS");
  });

  it("keeps a zero amount rather than skipping it", () => {
    const csv = "Date,Description,Amount\n2026-02-15,CARD VERIFICATION,0.00\n";
    expect(parseStatementCsv(csv)).toMatchObject({ transactions: [{ amount: 0 }], skippedRows: 0 });
  });

  it("keeps an unparseable date as the raw string rather than dropping the row", () => {
    const csv = "Date,Description,Amount\n31/01/2026,WINGTIP TOYS,-20.00\n";
    expect(parseStatementCsv(csv).transactions).toEqual([
      { date: "31/01/2026", description: "WINGTIP TOYS", amount: -20 },
    ]);
  });

  it("skips rows whose amount isn't a number", () => {
    const csv = "Date,Description,Amount\n2026-02-16,PENDING HOLD,pending\n2026-02-17,REAL CHARGE,-3.00\n";
    expect(parseStatementCsv(csv)).toMatchObject({ transactions: [{ description: "REAL CHARGE" }], skippedRows: 1 });
  });

  it("ignores fully blank lines without counting them as skipped", () => {
    const csv = "Date,Description,Amount\n\n2026-02-18,TREY RESEARCH,-1.00\n\n";
    expect(parseStatementCsv(csv)).toMatchObject({ transactions: [{ amount: -1 }], skippedRows: 0 });
  });

  it("keeps a merchant whose name merely contains a boilerplate word (IMP-4)", () => {
    const csv = "Date,Description,Amount\n2026-02-19,TOTAL WINE AND MORE,-30.00\n2026-02-20,Closing Balance,970.00\n";
    expect(parseStatementCsv(csv)).toMatchObject({
      transactions: [{ description: "TOTAL WINE AND MORE" }],
      skippedRows: 1,
    });
  });
});

describe("parseStatementCsv — unrecognized files (IMP-1)", () => {
  it.each([
    ["no date column", "Posted,Description,Amount\n2026-01-01,X,-1\n"],
    ["no description column", "Date,Info,Amount\n2026-01-01,X,-1\n"],
    ["no amount-like column", "Date,Description,Total\n2026-01-01,X,-1\n"],
    ["account preamble above the header", "Account Summary for Chequing\nDate,Description,Amount\n2026-01-01,X,-1\n"],
  ])("returns no transactions and a warning listing the headers (%s)", (_label, csv) => {
    const result = parseStatementCsv(csv);
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(0);
    expect(result.warning).toMatch(/Couldn't find recognizable date\/description\/amount columns/);
    expect(result.warning).toContain("Detected headers:");
  });

  it("says (none) for an empty file", () => {
    expect(parseStatementCsv("").warning).toContain("Detected headers: (none)");
  });

  it("returns a header-only file as zero transactions with no warning", () => {
    expect(parseStatementCsv("Date,Description,Amount\n")).toMatchObject({ transactions: [], skippedRows: 0 });
  });
});

describe("parseStatementCsv — separate debit/credit columns (IMP-1, IMP-7)", () => {
  // Imitates a chequing export with Withdrawals / Deposits / Balance columns.
  const result = parseStatementCsv(readCsvFixture("csv-debit-credit-columns.csv"));

  it("makes withdrawals negative and deposits positive, ignoring the balance column", () => {
    expect(result.transactions).toEqual([
      { date: "2026-04-02", description: "CONTOSO HARDWARE", amount: -45.2 },
      { date: "2026-04-03", description: "E-TRANSFER FROM FRIEND", amount: 60 },
      { date: "2026-04-04", description: "FABRIKAM TRANSIT PASS", amount: -120 },
      { date: "2026-04-05", description: "FEE REVERSAL", amount: 0 },
    ]);
  });

  it("skips the balance-forward line as boilerplate (IMP-4)", () => {
    expect(result.skippedRows).toBe(1);
  });

  it.each([
    ["Debit", "Credit"],
    ["Money Out", "Money In"],
    ["Paid Out", "Paid In"],
    ["Withdrawal", "Deposit"],
  ])("recognizes %s / %s headers", (debitH, creditH) => {
    const csv = `Date,Description,${debitH},${creditH}\n2026-04-10,OUT,10.00,\n2026-04-11,IN,,25.00\n`;
    expect(parseStatementCsv(csv).transactions.map((t) => t.amount)).toEqual([-10, 25]);
  });

  it("forces the sign from the column even if the bank already signed the value", () => {
    const csv = "Date,Description,Debit,Credit\n2026-04-12,OUT,-10.00,\n2026-04-13,IN,,-25.00\n";
    expect(parseStatementCsv(csv).transactions.map((t) => t.amount)).toEqual([-10, 25]);
  });

  it("works with only a debit column (e.g. a card export listing charges)", () => {
    const csv = "Date,Description,Debit\n2026-04-14,COHO WINERY,33.00\n";
    expect(parseStatementCsv(csv).transactions).toEqual([{ date: "2026-04-14", description: "COHO WINERY", amount: -33 }]);
  });

  it("skips a row with neither a debit nor a credit value", () => {
    const csv = "Date,Description,Debit,Credit\n2026-04-15,MEMO LINE,,\n";
    expect(parseStatementCsv(csv)).toMatchObject({ transactions: [], skippedRows: 1 });
  });

  // BUG (new): "Debit Amount" / "Credit Amount" headers (a common export
  // layout) loosely match the single-amount column candidate "amount", so the
  // parser reads only the debit column as an unsigned single amount: charges
  // come out POSITIVE (counted as income) and every credit row is skipped.
  it.fails("handles 'Debit Amount' / 'Credit Amount' headers as a debit/credit pair", () => {
    const csv =
      "Date,Description,Debit Amount,Credit Amount\n2026-04-16,GRAPHIC DESIGN INST,50.00,\n2026-04-17,REFUND,,20.00\n";
    expect(parseStatementCsv(csv).transactions.map((t) => t.amount)).toEqual([-50, 20]);
  });

  // BUG (new): a "Value Date" column (common alongside a posting date) loosely
  // matches the amount candidate "value" when there's no exact "Amount"
  // header, so amounts are read from the date column and every row is skipped.
  it.fails("isn't confused by a 'Value Date' column in a debit/credit layout", () => {
    const csv = "Date,Value Date,Description,Debit,Credit\n2026-04-18,2026-04-18,HUMONGOUS INSURANCE,90.00,\n";
    expect(parseStatementCsv(csv).transactions).toEqual([
      { date: "2026-04-18", description: "HUMONGOUS INSURANCE", amount: -90 },
    ]);
  });
});

describe("parseStatementCsv — credit-card exports (IMP-7, BUG-1, BUG-16)", () => {
  // Imitates Scotiabank's card "Transaction History" CSV (same columns): charges
  // are positive, payments/credits negative, and a blank Merchant Category on
  // the card payment. Merchants and numbers are invented.
  const csv = readCsvFixture("csv-card-export.csv");

  it("detects a card export from its headers and says so", () => {
    const result = parseStatementCsv(csv);
    expect(result.accountType).toBe("card");
    expect(result.accountTypeSource).toBe("detected");
    expect(result.warning).toMatch(/credit card statement/);
  });

  it("imports charges as expenses and payments/credits as money in (BUG-1)", () => {
    expect(parseStatementCsv(csv).transactions.map((t) => t.amount)).toEqual([-54.2, -4.75, 1250, 18.99, -112.31]);
  });

  it("uses Merchant Name, not Merchant Category, as the description (BUG-16)", () => {
    expect(parseStatementCsv(csv).transactions.map((t) => t.description)).toEqual([
      "WOODGROVE MARKET #12",
      "FOURTH COFFEE",
      "PRE-AUTHORIZED PAYMENT",
      "LITWARE BOOKS",
      "CONTOSO CABLE",
    ]);
  });

  it("keeps the card payment row whose Merchant Category is blank, as a Transfer", () => {
    const result = parseStatementCsv(csv);
    expect(result.skippedRows).toBe(0);
    const payment = result.transactions.find((t) => t.description === "PRE-AUTHORIZED PAYMENT");
    expect(payment).toMatchObject({ amount: 1250, categoryHint: "Transfers" });
    // A refund is money in but not a transfer — it gets categorized normally.
    expect(result.transactions.find((t) => t.description === "LITWARE BOOKS")?.categoryHint).toBeUndefined();
  });

  it("lets the uploader override the detection either way", () => {
    const asBank = parseStatementCsv(csv, { accountType: "bank" });
    expect(asBank.accountType).toBe("bank");
    expect(asBank.accountTypeSource).toBe("user");
    expect(asBank.transactions.map((t) => t.amount)).toEqual([54.2, 4.75, -1250, -18.99, 112.31]);
    expect(asBank.warning).toBeUndefined();

    const generic = "Date,Description,Amount\n2026-06-01,FOURTH COFFEE,4.75\n";
    expect(parseStatementCsv(generic).accountType).toBe("bank");
    expect(parseStatementCsv(generic, { accountType: "card" }).transactions[0].amount).toBe(-4.75);
  });

  it("needs two card-only header signals, not one", () => {
    const oneSignal = "Date,Description,Amount,Rewards\n2026-06-01,FOURTH COFFEE,4.75,\n";
    expect(parseStatementCsv(oneSignal).accountType).toBe("bank");
    expect(parseStatementCsv(oneSignal).transactions[0].amount).toBe(4.75);
  });

  it("never flips a debit/credit pair, even with card-like headers", () => {
    const pair = "Date,Merchant Name,Merchant Category,Name on Card,Debit,Credit\n2026-06-01,FOURTH COFFEE,Eating Places,ALEX SAMPLE,4.75,\n";
    expect(parseStatementCsv(pair).transactions[0].amount).toBe(-4.75);
  });

  it("attaches the source row only when asked", () => {
    expect(parseStatementCsv(csv).transactions[0].sourceRow).toBeUndefined();
    const row = parseStatementCsv(csv, { includeSourceRow: true }).transactions[0].sourceRow;
    expect(row?.["Merchant Category"]).toBe("Grocery Stores and Supermarkets");
  });
});

describe("parseStatementCsv — institution detection (IMP-6)", () => {
  it("detects an institution named anywhere in the file", () => {
    const csv = "Date,Description,Amount\n2026-06-01,PAYMENT - THANK YOU CAPITAL ONE,200.00\n";
    expect(parseStatementCsv(csv).detectedInstitution).toBe("Capital One");
  });

  it("doesn't report an institution when the columns aren't recognized", () => {
    expect(parseStatementCsv("Foo,Bar\nCapital One,1\n").detectedInstitution).toBeUndefined();
  });
});
