import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { revokePlaidAccessForStatement } from "@/lib/plaidSync";

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

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, institution } = body as { id: number; institution: string | null };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const normalized = institution?.trim() || null;

  const db = getDb();
  const update = db.transaction(() => {
    db.prepare(`UPDATE statements SET institution = ? WHERE id = ?`).run(normalized, id);
    db.prepare(`UPDATE transactions SET institution = ? WHERE statement_id = ?`).run(normalized, id);
  });
  update();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  // No-op for a statement that isn't Plaid-connected; revokes access at
  // Plaid first for one that is, so a connected bank can't outlive the
  // local record of it having been connected.
  await revokePlaidAccessForStatement(Number(id));
  const db = getDb();
  db.prepare(`DELETE FROM statements WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
