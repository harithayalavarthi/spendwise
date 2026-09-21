import { PDFParse } from "pdf-parse";
import { parseAmountToken, type ParseResult } from "./parseStatement";
import { isStatementNoise } from "./statementNoise";

const MONEY_TOKEN = String.raw`\(?-?\$?\d[\d,]*\.\d{2}\)?`;
const TRAILING_ONE_AMOUNT_RE = new RegExp(`(${MONEY_TOKEN})\\s*$`);

// Numeric dates (MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD) carry their own year.
const NUMERIC_DATE_RE = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/;
// "Aug 8", "Aug8" (extraction sometimes drops the space), "Aug 8, 2026".
const MONTH_NAME_DATE_RE =
  /^([A-Za-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const CREDIT_KEYWORDS = ["deposit", "payroll", "direct dep", "refund", "credit", "reversal", "transfer in"];

// Statement-level vocabulary that indicates "this is a credit card statement,
// not a checking account" — on those, an unsigned line amount is a charge
// (an expense) rather than a deposit, the opposite of a bank account export.
const CREDIT_CARD_INDICATORS = [
  "new balance",
  "minimum payment",
  "credit limit",
  "available credit",
  "previous balance",
  "payment due date",
];

interface DateMatch {
  consumedLength: number;
  month: number; // 0-11
  day: number;
  year?: number; // present only if the token itself carried a year
}

function matchLeadingDate(s: string): DateMatch | null {
  const numeric = s.match(NUMERIC_DATE_RE);
  if (numeric) {
    const raw = numeric[1];
    let year: number, month: number, day: number;
    if (/^\d{4}-/.test(raw)) {
      [year, month, day] = raw.split("-").map(Number);
    } else {
      [month, day, year] = raw.split(/[/-]/).map(Number);
      if (year < 100) year += year < 70 ? 2000 : 1900;
    }
    return { consumedLength: numeric[0].length, month: month - 1, day, year };
  }

  const named = s.match(MONTH_NAME_DATE_RE);
  if (named) {
    const monthIdx = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (monthIdx == null) return null;
    const day = Number(named[2]);
    if (day < 1 || day > 31) return null;
    return {
      consumedLength: named[0].length,
      month: monthIdx,
      day,
      year: named[3] ? Number(named[3]) : undefined,
    };
  }

  return null;
}

// Consume one leading date, then optionally a second one right after it (many
// statements list both a transaction date and a posting date per line) —
// only the first is kept.
function consumeLeadingDates(line: string): { date: DateMatch; rest: string } | null {
  const first = matchLeadingDate(line);
  if (!first) return null;
  let rest = line.slice(first.consumedLength).replace(/^\s+/, "");

  const second = matchLeadingDate(rest);
  if (second) {
    rest = rest.slice(second.consumedLength).replace(/^\s+/, "");
  }

  return { date: first, rest };
}

// Finds a reference (year, month) from statement metadata text — e.g.
// "STATEMENT DATE: September 08, 2026" — used to fill in the year for
// transaction lines that only print month/day.
function findReferenceDate(fullText: string): { year: number; month: number } | null {
  const labeled = fullText.match(
    /(?:statement date|closing date|billing date)\s*:?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})/i
  );
  const candidate =
    labeled ?? fullText.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!candidate) return null;
  const monthIdx = MONTHS[candidate[1].slice(0, 3).toLowerCase()];
  if (monthIdx == null) return null;
  return { year: Number(candidate[3]), month: monthIdx };
}

function resolveYear(date: DateMatch, reference: { year: number; month: number } | null): number {
  if (date.year) return date.year;
  if (!reference) return new Date().getFullYear();
  // A transaction month that's far "ahead" of the statement's reference
  // month almost always means it actually belongs to the previous year
  // (e.g. a Dec transaction on a statement dated early January).
  const diff = date.month - reference.month;
  return diff > 6 ? reference.year - 1 : reference.year;
}

function guessCheckingAccountSign(description: string, amountToken: string): number | undefined {
  const amount = parseAmountToken(amountToken);
  if (amount == null) return undefined;
  if (amountToken.trim().startsWith("-") || amountToken.trim().startsWith("(")) {
    return -Math.abs(amount);
  }
  const lower = description.toLowerCase();
  if (CREDIT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return Math.abs(amount);
  }
  return -Math.abs(amount);
}

function looksLikeCreditCardStatement(fullText: string): boolean {
  const lower = fullText.toLowerCase();
  return CREDIT_CARD_INDICATORS.filter((kw) => lower.includes(kw)).length >= 2;
}

function parseLine(
  line: string,
  reference: { year: number; month: number } | null,
  isCreditCard: boolean
): { date: string; description: string; amount: number } | null {
  const consumed = consumeLeadingDates(line.trim());
  if (!consumed) return null;
  const { date, rest } = consumed;

  // Column order in extracted PDF text follows the PDF's internal content
  // stream, which doesn't always match the visual left-to-right layout —
  // some statements print the amount right after the dates, description
  // last. So: take the first money-looking token anywhere on the line as
  // the amount, and treat everything else as the description. If a second
  // money token is left trailing at the end, it's almost always a running
  // balance column — drop it.
  const amountMatch = rest.match(new RegExp(MONEY_TOKEN));
  if (!amountMatch || amountMatch.index == null) return null;
  const amountToken = amountMatch[0];

  let description = (
    rest.slice(0, amountMatch.index) + " " + rest.slice(amountMatch.index + amountToken.length)
  ).trim();
  const trailingBalance = description.match(TRAILING_ONE_AMOUNT_RE);
  if (trailingBalance && trailingBalance.index != null) {
    description = description.slice(0, trailingBalance.index).trim();
  }
  description = description.replace(/\s+/g, " ");
  if (!description || isStatementNoise(description)) return null;

  const amount = isCreditCard
    ? (() => {
        const parsed = parseAmountToken(amountToken);
        if (parsed == null) return undefined;
        // Credit card statements invert the usual convention: an unsigned
        // line is a charge (an expense), an explicitly negative line is a
        // payment/credit (reduces the balance) rather than a deposit.
        const statementNegative = amountToken.trim().startsWith("-") || amountToken.trim().startsWith("(");
        return statementNegative ? Math.abs(parsed) : -Math.abs(parsed);
      })()
    : guessCheckingAccountSign(description, amountToken);

  if (amount == null) return null;

  const year = resolveYear(date, reference);
  const iso = `${year.toString().padStart(4, "0")}-${(date.month + 1).toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;

  return { date: iso, description, amount };
}

export async function parseStatementPdf(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: buffer });
  let text: string;
  try {
    const result = await parser.getText();
    text = result.text;
  } finally {
    await parser.destroy();
  }

  const reference = findReferenceDate(text);
  const isCreditCard = looksLikeCreditCardStatement(text);

  const lines = text.split("\n");
  const transactions: ParseResult["transactions"] = [];
  let skippedRows = 0;
  let candidateLines = 0;

  for (const line of lines) {
    if (!consumeLeadingDates(line.trim())) continue;
    candidateLines++;
    const parsed = parseLine(line, reference, isCreditCard);
    if (parsed) {
      transactions.push(parsed);
    } else {
      skippedRows++;
    }
  }

  if (candidateLines === 0) {
    return {
      transactions: [],
      skippedRows: 0,
      warning:
        "Couldn't find any lines starting with a date in this PDF. PDF parsing works best with " +
        "simple, text-based statements (not scanned images) — a CSV export will be more reliable.",
    };
  }

  const warnings = [
    "PDF parsing is heuristic: it guesses columns and debit/credit sign from each line's text. " +
      "Double-check the imported amounts, especially for anything that looks like a deposit or payment.",
  ];
  if (!reference) {
    warnings.push(
      "Couldn't find a statement date to anchor transaction years — dates without an explicit year defaulted to the current year, which may be wrong."
    );
  }
  if (isCreditCard) {
    warnings.push(
      "Detected as a credit card statement: charges were imported as expenses and payments/credits as " +
        "positive amounts categorized as Transfers, rather than income."
    );
  }

  return { transactions, skippedRows, warning: warnings.join(" ") };
}
