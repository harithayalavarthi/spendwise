import { PDFParse } from "pdf-parse";
import { parseAmountToken, parseDateToken, type ParseResult } from "./parseStatement";

const LEADING_DATE_RE = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s+/;
const MONEY_TOKEN = String.raw`\(?-?\$?\d[\d,]*\.\d{2}\)?`;
const TRAILING_TWO_AMOUNTS_RE = new RegExp(`(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})\\s*$`);
const TRAILING_ONE_AMOUNT_RE = new RegExp(`(${MONEY_TOKEN})\\s*$`);

const CREDIT_KEYWORDS = ["deposit", "payroll", "direct dep", "refund", "credit", "reversal", "transfer in"];

function guessSign(description: string, amountToken: string): number | undefined {
  const amount = parseAmountToken(amountToken);
  if (amount == null) return undefined;
  // explicit sign or parens in the token itself is authoritative
  if (amountToken.trim().startsWith("-") || amountToken.trim().startsWith("(")) {
    return -Math.abs(amount);
  }
  const lower = description.toLowerCase();
  if (CREDIT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return Math.abs(amount);
  }
  // Most line items on a statement are debits; without an explicit sign we
  // default to expense. This is the main source of error for PDF imports.
  return -Math.abs(amount);
}

function parseLine(line: string): { date: string; description: string; amount: number } | null {
  const trimmed = line.trim();
  const dateMatch = trimmed.match(LEADING_DATE_RE);
  if (!dateMatch) return null;

  const afterDate = trimmed.slice(dateMatch[0].length);

  // Two trailing money tokens usually means "amount, running balance" — keep
  // the first (the amount) and drop the balance.
  const twoMatch = afterDate.match(TRAILING_TWO_AMOUNTS_RE);
  if (twoMatch) {
    const description = afterDate.slice(0, twoMatch.index).trim();
    if (!description) return null;
    const amount = guessSign(description, twoMatch[1]);
    if (amount == null) return null;
    return { date: parseDateToken(dateMatch[1]), description, amount };
  }

  const oneMatch = afterDate.match(TRAILING_ONE_AMOUNT_RE);
  if (oneMatch) {
    const description = afterDate.slice(0, oneMatch.index).trim();
    if (!description) return null;
    const amount = guessSign(description, oneMatch[1]);
    if (amount == null) return null;
    return { date: parseDateToken(dateMatch[1]), description, amount };
  }

  return null;
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

  const lines = text.split("\n");
  const transactions: ParseResult["transactions"] = [];
  let skippedRows = 0;
  let candidateLines = 0;

  for (const line of lines) {
    if (!LEADING_DATE_RE.test(line.trim())) continue;
    candidateLines++;
    const parsed = parseLine(line);
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

  return {
    transactions,
    skippedRows,
    warning:
      "PDF parsing is heuristic: it guesses columns and debit/credit sign from each line's text. " +
      "Double-check the imported amounts, especially for anything that looks like a deposit.",
  };
}
