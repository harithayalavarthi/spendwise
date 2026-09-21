import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseStatementCsv } from "@/lib/parseStatement";
import { parseStatementPdf } from "@/lib/parsePdfStatement";
import { categorize } from "@/lib/categories";
import { transactionHash } from "@/lib/dedupe";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isPdf = name.endsWith(".pdf");

  if (!isCsv && !isPdf) {
    return NextResponse.json(
      { error: "Only CSV or PDF statements are supported" },
      { status: 400 }
    );
  }

  const { transactions, skippedRows, warning } = isCsv
    ? parseStatementCsv(await file.text())
    : await parseStatementPdf(Buffer.from(await file.arrayBuffer()));

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: warning ?? "No transactions could be parsed from this file" },
      { status: 422 }
    );
  }

  const db = getDb();
  const insertStatement = db.prepare(
    `INSERT INTO statements (filename, transaction_count) VALUES (?, ?)`
  );
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (statement_id, date, description, amount, category, hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const findExisting = db.prepare(`SELECT 1 FROM transactions WHERE hash = ? LIMIT 1`);

  const categoryCounts: Record<string, number> = {};
  let duplicates = 0;

  const statementId = db.transaction(() => {
    const seenInThisUpload = new Set<string>();
    const toInsert: Array<{ date: string; description: string; amount: number; category: string; hash: string }> = [];

    for (const t of transactions) {
      const hash = transactionHash(t.date, t.description, t.amount);
      if (seenInThisUpload.has(hash) || findExisting.get(hash)) {
        duplicates++;
        continue;
      }
      seenInThisUpload.add(hash);
      const category = categorize(t.description, t.amount);
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      toInsert.push({ date: t.date, description: t.description, amount: t.amount, category, hash });
    }

    const info = insertStatement.run(file.name, toInsert.length);
    const id = info.lastInsertRowid as number;
    for (const t of toInsert) {
      insertTransaction.run(id, t.date, t.description, t.amount, t.category, t.hash);
    }
    return id;
  })();

  const imported = transactions.length - duplicates;

  return NextResponse.json({
    statementId,
    imported,
    duplicates,
    skippedRows,
    warning,
    categoryCounts,
  });
}
