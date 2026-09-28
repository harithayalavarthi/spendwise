// One-off repair for BUG-1 / BUG-16 (Scotiabank card CSVs imported with the
// wrong signs, Merchant Category as the description, and card payments
// dropped). Dry run by default; changes nothing until --apply.
//
//   npx jiti scripts/repair-bug1-card-csv.ts                 # preview
//   npx jiti scripts/repair-bug1-card-csv.ts --apply         # back up, then repair
//   npx jiti scripts/repair-bug1-card-csv.ts --dir ~/Other   # where the original CSVs are
//
// Run from the repo root with the app's normal database (data/spendwise.db).
// It needs the original "Transaction History_*.csv" files, matched by the
// filename stored on each statement.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { applyCardCsvRepair, planCardCsvRepair, type RepairFile } from "../src/lib/repairCardCsvImport";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dirArg = args.indexOf("--dir");
const dir = dirArg >= 0 ? args[dirArg + 1].replace(/^~/, os.homedir()) : path.join(os.homedir(), "Downloads");
const money = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const db = getDb();
  const statements = db
    .prepare(`SELECT id, filename FROM statements WHERE filename LIKE 'Transaction History%.csv' ORDER BY id`)
    .all() as Array<{ id: number; filename: string }>;
  if (statements.length === 0) {
    console.log("No 'Transaction History' CSV statements found — nothing to repair.");
    return;
  }

  const files: RepairFile[] = [];
  for (const s of statements) {
    const file = path.join(dir, s.filename);
    if (!fs.existsSync(file)) {
      console.error(`Missing original file for statement ${s.id}: ${file}\nUse --dir to point at the folder with the original CSVs.`);
      process.exit(1);
    }
    files.push({ statementId: s.id, csvText: fs.readFileSync(file, "utf8") });
  }

  const plans = planCardCsvRepair(db, files);
  console.log(apply ? "REPAIR — will apply after backing up the database\n" : "DRY RUN — nothing will be changed\n");
  for (const p of plans) {
    console.log(`Statement ${p.statementId}: ${p.filename}`);
    console.log(`  rows: ${p.oldCount} → ${p.newRows.length}` + (p.duplicatesElsewhere ? ` (${p.duplicatesElsewhere} skipped as duplicates of rows in other statements)` : ""));
    console.log(`  income:    ${money(p.before.income)} → ${money(p.after.income)}`);
    console.log(`  expenses:  ${money(p.before.expense)} → ${money(p.after.expense)}`);
    console.log(`  transfers: ${money(p.before.transfers)} → ${money(p.after.transfers)} (card payments)`);
    for (const c of p.carried) console.log(`  keeps your category: ${c.date} ${money(c.amount)} → ${c.category}`);
    for (const u of p.unmatchedLocked) console.log(`  ⚠ couldn't match your category: ${u.date} ${money(u.amount)} ${u.category}`);
    console.log();
  }

  const unmatched = plans.reduce((n, p) => n + p.unmatchedLocked.length, 0);
  if (!apply) {
    console.log("Nothing changed. Re-run with --apply to back up the database and repair.");
    return;
  }
  if (unmatched > 0) {
    console.error(`Stopping: ${unmatched} manually set categor${unmatched === 1 ? "y" : "ies"} couldn't be matched (listed above).`);
    process.exit(1);
  }

  const backupDir = path.join(path.dirname(db.name), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `spendwise-before-bug1-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  await db.backup(backup);
  console.log(`Backed up the database to ${backup}`);

  await applyCardCsvRepair(db, plans);
  const after = db
    .prepare(
      `SELECT COUNT(*) AS n, ROUND(SUM(CASE WHEN amount > 0 AND category != 'Transfers' THEN amount ELSE 0 END), 2) AS income,
              ROUND(SUM(CASE WHEN amount < 0 AND category != 'Transfers' THEN -amount ELSE 0 END), 2) AS expense
       FROM transactions WHERE statement_id IN (${plans.map((p) => p.statementId).join(",")})`
    )
    .get() as { n: number; income: number; expense: number };
  console.log(`Repaired: ${after.n} rows now, income ${money(after.income)}, expenses ${money(after.expense)} (after categorization).`);
  console.log(`To undo: stop the app and copy the backup over data/spendwise.db.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
