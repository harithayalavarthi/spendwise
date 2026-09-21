import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseStatementCsv } from "@/lib/parseStatement";
import { categorize } from "@/lib/categories";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Only CSV files are supported right now" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const { transactions, skippedRows, warning } = parseStatementCsv(text);

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
    `INSERT INTO transactions (statement_id, date, description, amount, category)
     VALUES (?, ?, ?, ?, ?)`
  );

  const categoryCounts: Record<string, number> = {};

  const statementId = db.transaction(() => {
    const info = insertStatement.run(file.name, transactions.length);
    const id = info.lastInsertRowid as number;
    for (const t of transactions) {
      const category = categorize(t.description, t.amount);
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      insertTransaction.run(id, t.date, t.description, t.amount, category);
    }
    return id;
  })();

  return NextResponse.json({
    statementId,
    imported: transactions.length,
    skippedRows,
    warning,
    categoryCounts,
  });
}
