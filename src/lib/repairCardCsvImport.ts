// One-off repair for statements imported before BUG-1/BUG-16 were fixed: card
// CSV exports were stored with charges as positive amounts (counted as income),
// "Merchant Category" as the description, and rows with a blank category
// (card payments) dropped. This re-reads the original CSV with the fixed parser
// and replaces those statements' rows, carrying over manually locked
// categories. Re-uploading instead would double-count: the corrected rows have
// different descriptions/signs, so their dedupe hashes don't match the old ones.
//
// planCardCsvRepair() only reads the database. applyCardCsvRepair() categorizes
// the new rows (keyword → cache → local LLM, as on upload) and swaps them in
// one transaction. Callers must back up the database first (see
// scripts/repair-bug1-card-csv.ts).
import type Database from "better-sqlite3";
import { categorizeTransaction } from "./categorizeTransaction";
import { transactionHash } from "./dedupe";
import { parseStatementCsv } from "./parseStatement";

export interface RepairFile {
  statementId: number;
  csvText: string;
}

interface OldRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  category_locked: number;
}

export interface PlannedRow {
  date: string;
  description: string;
  amount: number;
  hash: string;
  // Known without guessing: a carried-over manual category, or the statement's
  // own hint (card payments are Transfers). Otherwise categorized on apply.
  knownCategory?: string;
  locked: boolean;
}

export interface StatementRepairPlan {
  statementId: number;
  filename: string;
  institution: string | null;
  oldCount: number;
  newRows: PlannedRow[];
  carried: Array<{ date: string; amount: number; category: string }>;
  unmatchedLocked: Array<{ date: string; amount: number; category: string }>;
  duplicatesElsewhere: number;
  before: { income: number; expense: number; transfers: number };
  after: { income: number; expense: number; transfers: number };
}

const cents = (n: number) => Math.round(n * 100);

function totals(rows: Array<{ amount: number; category?: string }>) {
  let income = 0;
  let expense = 0;
  let transfers = 0;
  for (const r of rows) {
    if (r.category === "Transfers") transfers += r.amount;
    else if (r.amount > 0) income += r.amount;
    else expense += -r.amount;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { income: round(income), expense: round(expense), transfers: round(transfers) };
}

export function planCardCsvRepair(db: Database.Database, files: RepairFile[]): StatementRepairPlan[] {
  const repairedIds = files.map((f) => f.statementId);
  const existsElsewhere = db.prepare(
    `SELECT 1 FROM transactions WHERE hash = ? AND statement_id NOT IN (${repairedIds.map(() => "?").join(",")}) LIMIT 1`
  );
  const seen = new Set<string>();

  return files.map(({ statementId, csvText }) => {
    const stmt = db.prepare(`SELECT filename, institution FROM statements WHERE id = ?`).get(statementId) as
      | { filename: string; institution: string | null }
      | undefined;
    if (!stmt) throw new Error(`Statement ${statementId} not found`);

    const oldRows = db
      .prepare(`SELECT id, date, description, amount, category, category_locked FROM transactions WHERE statement_id = ?`)
      .all(statementId) as OldRow[];
    const lockedPool = oldRows.filter((r) => r.category_locked === 1);

    const parsed = parseStatementCsv(csvText, { accountType: "card", includeSourceRow: true });
    const newRows: PlannedRow[] = [];
    const carried: StatementRepairPlan["carried"] = [];
    let duplicatesElsewhere = 0;

    for (const t of parsed.transactions) {
      const hash = transactionHash(t.date, t.description, t.amount);
      if (seen.has(hash) || existsElsewhere.get(hash, ...repairedIds)) {
        duplicatesElsewhere++;
        continue;
      }
      seen.add(hash);

      // The old import stored this row with the opposite sign and its Merchant
      // Category as the description — match on exactly that.
      const oldDescription = t.sourceRow?.["Merchant Category"]?.trim() ?? "";
      const i = lockedPool.findIndex(
        (o) => o.date === t.date && cents(o.amount) === cents(-t.amount) && o.description === oldDescription
      );
      if (i >= 0) {
        const [match] = lockedPool.splice(i, 1);
        carried.push({ date: t.date, amount: t.amount, category: match.category });
        newRows.push({ date: t.date, description: t.description, amount: t.amount, hash, knownCategory: match.category, locked: true });
      } else {
        newRows.push({ date: t.date, description: t.description, amount: t.amount, hash, knownCategory: t.categoryHint, locked: false });
      }
    }

    return {
      statementId,
      filename: stmt.filename,
      institution: stmt.institution,
      oldCount: oldRows.length,
      newRows,
      carried,
      unmatchedLocked: lockedPool.map((o) => ({ date: o.date, amount: o.amount, category: o.category })),
      duplicatesElsewhere,
      before: totals(oldRows),
      after: totals(newRows.map((r) => ({ amount: r.amount, category: r.knownCategory }))),
    };
  });
}

export async function applyCardCsvRepair(db: Database.Database, plans: StatementRepairPlan[]): Promise<void> {
  // Categorize first (may call the local LLM, which is async), then swap rows
  // in one synchronous transaction so a failure leaves nothing half-done.
  const categorized: Array<{ plan: StatementRepairPlan; rows: Array<PlannedRow & { category: string }> }> = [];
  for (const plan of plans) {
    const rows: Array<PlannedRow & { category: string }> = [];
    for (const r of plan.newRows) {
      const category = r.knownCategory ?? (await categorizeTransaction(r.description, r.amount)).category;
      rows.push({ ...r, category });
    }
    categorized.push({ plan, rows });
  }

  const del = db.prepare(`DELETE FROM transactions WHERE statement_id = ?`);
  const ins = db.prepare(
    `INSERT INTO transactions (statement_id, date, description, amount, category, category_locked, hash, institution)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const count = db.prepare(`UPDATE statements SET transaction_count = ? WHERE id = ?`);

  db.transaction(() => {
    for (const { plan, rows } of categorized) {
      del.run(plan.statementId);
      for (const r of rows) {
        ins.run(plan.statementId, r.date, r.description, r.amount, r.category, r.locked ? 1 : 0, r.hash, plan.institution);
      }
      count.run(rows.length, plan.statementId);
    }
  })();
}
