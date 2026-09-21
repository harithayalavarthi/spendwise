import Papa from "papaparse";

export interface ParsedTransaction {
  date: string; // ISO yyyy-mm-dd when parseable, otherwise the raw string
  description: string;
  amount: number; // positive = money in, negative = money out
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  skippedRows: number;
  warning?: string;
}

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date", "trans date"];
const DESCRIPTION_HEADERS = [
  "description",
  "narrative",
  "memo",
  "details",
  "transaction details",
  "payee",
  "merchant",
];
const AMOUNT_HEADERS = ["amount", "transaction amount", "value"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals", "money out", "paid out"];
const CREDIT_HEADERS = ["credit", "deposit", "deposits", "money in", "paid in"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
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

function parseAmount(raw: string | undefined): number | undefined {
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

function parseDate(raw: string): string {
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return trimmed;
}

export function parseStatementCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const dateCol = findColumn(headers, DATE_HEADERS);
  const descCol = findColumn(headers, DESCRIPTION_HEADERS);
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

  const transactions: ParsedTransaction[] = [];
  let skippedRows = 0;

  for (const row of parsed.data) {
    const dateRaw = row[dateCol];
    const description = row[descCol]?.trim();
    if (!dateRaw || !description) {
      skippedRows++;
      continue;
    }

    let amount: number | undefined;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    } else {
      const debit = parseAmount(row[debitCol ?? ""]);
      const credit = parseAmount(row[creditCol ?? ""]);
      if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit === 0 || credit === 0) amount = 0;
    }

    if (amount == null) {
      skippedRows++;
      continue;
    }

    transactions.push({
      date: parseDate(dateRaw),
      description,
      amount,
    });
  }

  return { transactions, skippedRows };
}
