import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const statements = db
    .prepare(
      `SELECT id, filename, uploaded_at AS uploadedAt, transaction_count AS transactionCount, institution
       FROM statements ORDER BY uploaded_at DESC`
    )
    .all();
  return NextResponse.json({ statements });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const db = getDb();
  db.prepare(`DELETE FROM statements WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
