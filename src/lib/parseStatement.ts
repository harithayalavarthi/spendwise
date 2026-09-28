import Papa from "papaparse";
import { isStatementNoise } from "./statementNoise";
import { detectInstitution } from "./detectInstitution";

export interface ParsedTransaction {
  date: string; // ISO yyyy-mm-dd when parseable, otherwise the raw string
  description: string;
  amount: number; // positive = money in, negative = money out
  // Set when the statement itself tells us the category, so the caller can skip
  // guessing — e.g. a payment on a credit-card statement is a Transfer.
  categoryHint?: "Transfers";
  // The CSV row this came from (not stored) — used by one-off data repairs.
  sourceRow?: Record<string, string>;
}

export type AccountType = "bank" | "card";

export interface ParseResult {
  transactions: ParsedTransaction[];
  skippedRows: number;
  warning?: string;
  detectedInstitution?: string | null;
  accountType?: AccountType;
  accountTypeSource?: "detected" | "user";
}

export interface ParseCsvOptions {
  // "auto" (default) detects a credit-card export from its headers.
  accountType?: AccountType | "auto";
  // Attach each transaction's source CSV row (for one-off data repairs).
  includeSourceRow?: boolean;
}

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date", "trans date"];
// Order matters: the first match wins. "merchant name" beats the loose
// "merchant" match, which would otherwise pick "Merchant Category" (BUG-16).
const DESCRIPTION_HEADERS = [
  "description",
  "merchant name",
  "payee",
  "narrative",
  "memo",
  "details",
  "transaction details",
  "merchant",
];
// Columns that contain a description word but aren't descriptions.
const NOT_DESCRIPTION = ["category", "city", "state", "province", "country", "postal", "zip"];
// Header vocabulary that only credit-card exports use (e.g. Scotiabank's
// "Transaction Card Number", "Merchant Category", "Rewards", "Name on Card").
const CARD_HEADER_SIGNALS = ["card number", "name on card", "rewards", "merchant category", "cardmember", "card member"];
const AMOUNT_HEADERS = ["amount", "transaction amount", "value"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals", "money out", "paid out"];
const CREDIT_HEADERS = ["credit", "deposit", "deposits", "money in", "paid in"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], candidates: string[], exclude: string[] = []): string | undefined {
  const normalized = headers
    .map((h) => ({ raw: h, norm: normalizeHeader(h) }))
    .filter((h) => !exclude.some((x) => h.norm.includes(x)));
  for (const candidate of candidates) {
    const match = normalized.find((h) => h.norm === candidate);
    if (match) return match.raw;
  }
  // fall back to a loose "contains" match
  for (const candidate of candidates) {
    const match = normalized.find((h) => h.norm.includes(candidate));
    if (match) return match.raw;
  }
  return undefined;
}

export function parseAmountToken(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (s === "") return undefined;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-") return undefined;
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return negative ? -Math.abs(n) : n;
}

export function parseDateToken(raw: string): string {
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return trimmed;
}

// Card exports list charges as positive amounts and payments/credits as
// negative — the opposite of a bank account's export (BUG-1).
export function looksLikeCardExport(headers: string[]): boolean {
  const norm = headers.map(normalizeHeader);
  return CARD_HEADER_SIGNALS.filter((s) => norm.some((h) => h.includes(s))).length >= 2;
}

export function parseStatementCsv(csvText: string, options: ParseCsvOptions = {}): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const dateCol = findColumn(headers, DATE_HEADERS);
  const descCol = findColumn(headers, DESCRIPTION_HEADERS, NOT_DESCRIPTION);
  // Other description-like columns, used when the preferred one is blank on a row.
  const fallbackDescCols = DESCRIPTION_HEADERS.map((c) => findColumn(headers, [c], NOT_DESCRIPTION)).filter(
    (c): c is string => c != null && c !== descCol
  );
  const amountCol = findColumn(headers, AMOUNT_HEADERS);
  const debitCol = findColumn(headers, DEBIT_HEADERS);
  const creditCol = findColumn(headers, CREDIT_HEADERS);

  if (!dateCol || !descCol || (!amountCol && !debitCol && !creditCol)) {
    return {
      transactions: [],
      skippedRows: 0,
      warning:
        "Couldn't find recognizable date/description/amount columns in this file. " +
        `Detected headers: ${headers.join(", ") || "(none)"}`,
    };
  }

  // Only a single signed Amount column can use the card convention; a
  // debit/credit pair already says which way the money moved.
  const singleAmount = amountCol != null && !(debitCol && creditCol);
  const requested = options.accountType ?? "auto";
  const accountType: AccountType =
    requested === "auto" ? (singleAmount && looksLikeCardExport(headers) ? "card" : "bank") : requested;
  const flipSigns = accountType === "card" && singleAmount;

  const transactions: ParsedTransaction[] = [];
  let skippedRows = 0;

  for (const row of parsed.data) {
    const dateRaw = row[dateCol];
    const description =
      row[descCol]?.trim() || fallbackDescCols.map((c) => row[c]?.trim()).find((v) => v) || undefined;
    if (!dateRaw || !description) {
      skippedRows++;
      continue;
    }
    if (isStatementNoise(description)) {
      skippedRows++;
      continue;
    }

    let amount: number | undefined;
    if (amountCol) {
      amount = parseAmountToken(row[amountCol]);
    } else {
      const debit = parseAmountToken(row[debitCol ?? ""]);
      const credit = parseAmountToken(row[creditCol ?? ""]);
      if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit === 0 || credit === 0) amount = 0;
    }

    if (amount == null) {
      skippedRows++;
      continue;
    }
    if (flipSigns && amount !== 0) amount = -amount;

    transactions.push({
      date: parseDateToken(dateRaw),
      description,
      amount,
      // A payment to the card moves money between your own accounts.
      ...(accountType === "card" && amount > 0 && /\bpayment\b/i.test(description)
        ? { categoryHint: "Transfers" as const }
        : {}),
      ...(options.includeSourceRow ? { sourceRow: row } : {}),
    });
  }

  return {
    transactions,
    skippedRows,
    detectedInstitution: detectInstitution(csvText),
    accountType,
    accountTypeSource: requested === "auto" ? "detected" : "user",
    ...(accountType === "card"
      ? {
          warning:
            "Read as a credit card statement: charges were imported as expenses and payments/credits as " +
            "positive amounts (payments categorized as Transfers), rather than income.",
        }
      : {}),
  };
}
