import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStatementPdf } from "@/lib/parsePdfStatement";

// pdf-parse is replaced with a fake whose getText() returns whatever
// synthetic "extracted text" the test sets — no real PDFs are generated or
// read. Everything downstream of text extraction runs for real.
const pdf = vi.hoisted(() => ({
  text: "",
  getTextError: null as Error | null,
  destroyed: 0,
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() {
      if (pdf.getTextError) throw pdf.getTextError;
      return { text: pdf.text };
    }
    async destroy() {
      pdf.destroyed++;
    }
  },
}));

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

async function parseText(text: string) {
  pdf.text = text;
  return parseStatementPdf(Buffer.from("%PDF-fake"));
}

// Lines of a statement, joined the way pdf-parse emits them.
function statement(...lines: string[]): string {
  return lines.join("\n");
}

// Enough credit-card vocabulary (two indicators) to flip the sign convention.
const CARD_HEADER = ["New Balance $500.00", "Minimum Payment Due $25.00"];

beforeEach(() => {
  pdf.text = "";
  pdf.getTextError = null;
  pdf.destroyed = 0;
  // The parser logs every skipped dated line; keep test output quiet.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseStatementPdf — checking statement fixture (IMP-2, IMP-4)", () => {
  // Imitates a checking statement with Date | Description | Amount | Balance
  // columns, including one row where extraction put the amount before the
  // description.
  it("extracts each transaction, drops the running balance and opening/closing lines", async () => {
    const result = await parseText(fixture("pdf-checking-running-balance.txt"));

    expect(result.transactions).toEqual([
      { date: "2026-03-02", description: "BLUE KETTLE COFFEE", amount: -4.5 },
      { date: "2026-03-05", description: "ACME PAYROLL DIRECT DEP", amount: 2000 },
      { date: "2026-03-09", description: "GRIDLINE ELECTRIC", amount: -120 },
      { date: "2026-03-14", description: "FERNWOOD GROCERY", amount: -86.25 },
    ]);
    // Opening/Closing Balance lines start with a date, so they count as skipped.
    expect(result.skippedRows).toBe(2);
    expect(result.warning).toMatch(/PDF parsing is heuristic/);
    expect(result.warning).not.toMatch(/credit card/i);
    expect(result.detectedInstitution).toBeNull();
  });
});

describe("parseStatementPdf — leading dates (IMP-2)", () => {
  it.each([
    ["MM/DD/YYYY", "03/02/2026 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["MM-DD-YYYY", "03-02-2026 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["YYYY-MM-DD", "2026-03-02 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["MM/DD/YY", "03/02/26 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["Mon D, YYYY", "Mar 2, 2026 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["full month name", "March 2 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["Mon with trailing period", "Mar. 2 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["Sept abbreviation", "Sept 2 BLUE KETTLE COFFEE 4.50", "2026-09-02"],
    ["ordinal suffix", "Mar 2nd BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["no space between month and day", "Mar2 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["transaction + posting date (numeric)", "03/02/2026 03/04/2026 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
    ["transaction + posting date (named)", "Mar 2 Mar 4 BLUE KETTLE COFFEE 4.50", "2026-03-02"],
  ])("parses %s and keeps only the first date", async (_label, line, expectedDate) => {
    const result = await parseText(statement("Statement Date: March 31, 2026", line));
    expect(result.transactions).toEqual([{ date: expectedDate, description: "BLUE KETTLE COFFEE", amount: -4.5 }]);
  });

  it("ignores lines that don't start with a date", async () => {
    const result = await parseText(
      statement(
        "Statement Date: March 31, 2026",
        "Questions? Call 555-0100 anytime 4.50",
        "03/02/2026 BLUE KETTLE COFFEE 4.50",
      ),
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(0);
  });

  it("counts a dated line with no amount as skipped", async () => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", "03/02/2026 BLUE KETTLE COFFEE", "03/03/2026 FERNWOOD GROCERY 12.00"),
    );
    expect(result.transactions).toEqual([{ date: "2026-03-03", description: "FERNWOOD GROCERY", amount: -12 }]);
    expect(result.skippedRows).toBe(1);
  });

  // BUG: year-less numeric dates ("03/02", "03/02 03/04") never match —
  // NUMERIC_DATE_RE requires a year component and MONTH_NAME_DATE_RE needs a
  // month name — so these lines aren't even treated as candidates, although
  // the README says one or two leading dates "with or without a year" work.
  it.fails("parses year-less MM/DD dates (transaction + posting)", async () => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", "03/02 03/04 BLUE KETTLE COFFEE 4.50"),
    );
    expect(result.transactions).toEqual([{ date: "2026-03-02", description: "BLUE KETTLE COFFEE", amount: -4.5 }]);
  });
});

describe("parseStatementPdf — year inference (IMP-2)", () => {
  it.each([
    ["labeled statement date", "Statement Date: September 8, 2026", "Aug 30 CEDAR HARDWARE 15.00", "2026-08-30"],
    ["labeled closing date", "Closing Date: Sep 8, 2026", "Aug 30 CEDAR HARDWARE 15.00", "2026-08-30"],
    ["labeled billing date", "Billing Date: Sep 8 2026", "Aug 30 CEDAR HARDWARE 15.00", "2026-08-30"],
    ["unlabeled 'Mon D, YYYY' anywhere in the text", "Printed Sep 8, 2026", "Aug 30 CEDAR HARDWARE 15.00", "2026-08-30"],
    ["Dec transaction on a statement dated January", "Statement Date: Jan 5, 2027", "Dec 28 CEDAR HARDWARE 15.00", "2026-12-28"],
    ["Jan transaction on a statement dated January", "Statement Date: Jan 5, 2027", "Jan 2 CEDAR HARDWARE 15.00", "2027-01-02"],
    ["an explicit year on the line wins", "Statement Date: Jan 5, 2027", "Dec 28, 2025 CEDAR HARDWARE 15.00", "2025-12-28"],
  ])("uses the %s", async (_label, header, line, expectedDate) => {
    const result = await parseText(statement(header, line));
    expect(result.transactions.map((t) => t.date)).toEqual([expectedDate]);
    expect(result.warning).not.toMatch(/Couldn't find a statement date/);
  });

  it("prefers the labeled statement date over an earlier unlabeled date", async () => {
    const result = await parseText(
      statement("Member since Feb 1, 2019", "Statement Date: Mar 31, 2026", "Mar 2 BLUE KETTLE COFFEE 4.50"),
    );
    expect(result.transactions[0].date).toBe("2026-03-02");
  });

  it("falls back to the current year and warns when no statement date is printed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));

    const result = await parseText(statement("Mar 2 BLUE KETTLE COFFEE 4.50"));

    expect(result.transactions[0].date).toBe("2026-03-02");
    expect(result.warning).toMatch(/Couldn't find a statement date/);
  });

  // BUG: when only a statement *period* spanning Dec→Jan is printed (no
  // "Statement/Closing/Billing Date:" label), the first "Mon D, YYYY" in the
  // text — the period's start, Dec 20, 2026 — becomes the reference, so a Jan
  // transaction resolves to Jan 2026 instead of Jan 2027 (a year early).
  it.fails("infers the year from a Dec→Jan statement period", async () => {
    const result = await parseText(
      statement(
        "Statement Period: Dec 20, 2026 to Jan 19, 2027",
        "Dec 22 CEDAR HARDWARE 15.00",
        "Jan 4 BLUE KETTLE COFFEE 4.50",
      ),
    );
    expect(result.transactions.map((t) => t.date)).toEqual(["2026-12-22", "2027-01-04"]);
  });
});

describe("parseStatementPdf — amount and running balance (IMP-2)", () => {
  it.each([
    ["amount at the end", "03/02/2026 BLUE KETTLE COFFEE 4.50", "BLUE KETTLE COFFEE", -4.5],
    ["amount then running balance", "03/02/2026 BLUE KETTLE COFFEE 4.50 1,234.56", "BLUE KETTLE COFFEE", -4.5],
    ["amount right after the date", "03/02/2026 4.50 BLUE KETTLE COFFEE", "BLUE KETTLE COFFEE", -4.5],
    ["amount after the date, balance at the end", "03/02/2026 4.50 BLUE KETTLE COFFEE 1,234.56", "BLUE KETTLE COFFEE", -4.5],
    ["dollar sign and thousands separator", "03/02/2026 LAKESIDE FURNITURE $1,250.00", "LAKESIDE FURNITURE", -1250],
    ["explicit minus sign", "03/02/2026 BLUE KETTLE COFFEE -4.50", "BLUE KETTLE COFFEE", -4.5],
    ["minus before the dollar sign", "03/02/2026 BLUE KETTLE COFFEE -$4.50", "BLUE KETTLE COFFEE", -4.5],
    ["parenthesized amount", "03/02/2026 BLUE KETTLE COFFEE (4.50)", "BLUE KETTLE COFFEE", -4.5],
    ["numbers without cents stay in the description", "03/02/2026 FUEL STOP #2041 PUMP 7 38.10", "FUEL STOP #2041 PUMP 7", -38.1],
    ["collapses internal whitespace", "03/02/2026   BLUE    KETTLE   COFFEE    4.50", "BLUE KETTLE COFFEE", -4.5],
  ])("handles %s", async (_label, line, description, amount) => {
    const result = await parseText(statement("Statement Date: March 31, 2026", line));
    expect(result.transactions).toEqual([{ date: "2026-03-02", description, amount }]);
  });
});

describe("parseStatementPdf — checking-account sign guess (IMP-2)", () => {
  it.each([
    ["an unsigned purchase is an expense", "BLUE KETTLE COFFEE 4.50", -4.5],
    ["payroll is income", "ACME PAYROLL 2,000.00", 2000],
    ["direct deposit is income", "ACME DIRECT DEP 2,000.00", 2000],
    ["a deposit is income", "MOBILE DEPOSIT 150.00", 150],
    ["a refund is income", "FERNWOOD GROCERY REFUND 12.00", 12],
    ["a transfer in is income", "TRANSFER IN FROM SAVINGS 300.00", 300],
    ["an explicit minus wins over a credit keyword", "REFUND REVERSAL FEE -5.00", -5],
  ])("%s", async (_label, rest, amount) => {
    const result = await parseText(statement("Statement Date: March 31, 2026", `03/02/2026 ${rest}`));
    expect(result.transactions.map((t) => t.amount)).toEqual([amount]);
  });
});

describe("parseStatementPdf — credit card statements (IMP-3)", () => {
  // Imitates a card statement with trans/post date columns, a summary box
  // at the top, and a billing cycle crossing into the new year.
  it("parses the credit card fixture with the card sign convention", async () => {
    const result = await parseText(fixture("pdf-credit-card.txt"));

    expect(result.transactions).toEqual([
      { date: "2026-12-20", description: "PINECONE BOOKSHOP", amount: -42.75 },
      { date: "2026-12-28", description: "PAYMENT - THANK YOU", amount: 300 },
      { date: "2027-01-02", description: "ORBIT CINEMA", amount: -20 },
      { date: "2027-01-03", description: "ORBIT CINEMA REFUND", amount: 10 },
    ]);
    // The dated "New Balance" summary line is boilerplate.
    expect(result.skippedRows).toBe(1);
    expect(result.warning).toMatch(/Detected as a credit card statement/);
    expect(result.warning).toMatch(/Transfers/);
  });

  it.each([
    ["new balance + minimum payment", ["New Balance $500.00", "Minimum Payment Due $25.00"]],
    ["credit limit + available credit", ["Credit Limit $5,000.00", "Available Credit $4,500.00"]],
    ["previous balance + payment due date", ["Previous Balance $450.00", "Payment Due Date: 04/25/2026"]],
  ])("is detected from %s wording", async (_label, header) => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", ...header, "03/02/2026 PINECONE BOOKSHOP 42.75"),
    );
    expect(result.transactions[0].amount).toBe(-42.75);
    expect(result.warning).toMatch(/Detected as a credit card statement/);
  });

  it("needs two indicators — one alone keeps the checking convention", async () => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", "New Balance $500.00", "03/02/2026 SPRINGFIELD REFUND CREDIT 42.75"),
    );
    // Checking convention: "refund"/"credit" in the description → income.
    expect(result.transactions[0].amount).toBe(42.75);
    expect(result.warning).not.toMatch(/credit card/i);
  });

  it.each([
    ["an unsigned charge is an expense", "PINECONE BOOKSHOP 42.75", -42.75],
    // Keywords that mean income on a checking account don't flip a card charge.
    ["an unsigned line with a credit keyword is still a charge", "DEPOSIT HOLD CREDIT CHECK 42.75", -42.75],
    ["a minus-signed payment is positive", "PAYMENT - THANK YOU -300.00", 300],
    ["a parenthesized credit is positive", "ORBIT CINEMA REFUND (10.00)", 10],
  ])("%s", async (_label, rest, amount) => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", ...CARD_HEADER, `03/02/2026 ${rest}`),
    );
    expect(result.transactions.map((t) => t.amount)).toEqual([amount]);
  });

  // BUG: a "CR" suffix — how many card statements mark payments and credits —
  // isn't read, so "10.00 CR" is treated as an unsigned charge (-10) and the
  // "CR" is left in the description, instead of a +10 credit.
  it.fails("treats a CR-suffixed amount as a payment/credit", async () => {
    const result = await parseText(
      statement("Statement Date: March 31, 2026", ...CARD_HEADER, "03/02/2026 ORBIT CINEMA REFUND 10.00 CR"),
    );
    expect(result.transactions).toEqual([{ date: "2026-03-02", description: "ORBIT CINEMA REFUND", amount: 10 }]);
  });
});

describe("parseStatementPdf — statement boilerplate (IMP-4)", () => {
  it.each([
    "Opening Balance",
    "Closing Balance",
    "Previous Balance",
    "New Balance",
    "Beginning Balance",
    "Ending Balance",
    "Balance Forward",
    "Statement Balance",
    "Minimum Payment",
    "Credit Limit",
    "Total",
    "Subtotal",
    "OPENING BALANCE",
  ])("drops a dated '%s' line", async (label) => {
    const result = await parseText(statement("Statement Date: March 31, 2026", `03/31/2026 ${label} 1,234.56`));
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(1);
  });

  it("keeps a real merchant whose name merely contains 'total' or 'balance'", async () => {
    const result = await parseText(
      statement(
        "Statement Date: March 31, 2026",
        "03/02/2026 TOTAL WINE AND MORE 30.00",
        "03/03/2026 BALANCE YOGA STUDIO 25.00",
      ),
    );
    expect(result.transactions.map((t) => t.description)).toEqual(["TOTAL WINE AND MORE", "BALANCE YOGA STUDIO"]);
  });
});

describe("parseStatementPdf — no transactions / garbage input (IMP-2)", () => {
  it.each([
    ["empty text", ""],
    ["whitespace only", "   \n\n\t  \n"],
    ["prose with no dated lines", statement("Maple Harbor Credit Union", "Thank you for your business.", "Page 1 of 1")],
    ["binary-looking garbage", "\u0000\u0001%%EOF ÿØÿà �� 12.34 @@@"],
  ])("returns an empty result with a warning for %s", async (_label, text) => {
    const result = await parseText(text);
    expect(result).toEqual({
      transactions: [],
      skippedRows: 0,
      warning: expect.stringMatching(/Couldn't find any lines starting with a date/),
    });
  });

  it("returns no transactions when every dated line lacks an amount", async () => {
    const result = await parseText(statement("Statement Date: March 31, 2026", "03/02/2026 NOTE", "03/03/2026 NOTE"));
    expect(result.transactions).toEqual([]);
    expect(result.skippedRows).toBe(2);
  });

  it("does not treat an impossible day as a date", async () => {
    const result = await parseText(statement("Mar 45 BLUE KETTLE COFFEE 4.50"));
    expect(result.transactions).toEqual([]);
  });

  it("always releases the parser, even when text extraction throws", async () => {
    pdf.getTextError = new Error("bad xref table");
    await expect(parseStatementPdf(Buffer.from("not a pdf"))).rejects.toThrow("bad xref table");
    expect(pdf.destroyed).toBe(1);
  });
});
