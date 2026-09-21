import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";

export async function GET(request: NextRequest) {
  const db = getDb();
  const category = request.nextUrl.searchParams.get("category");
  const month = request.nextUrl.searchParams.get("month");

  let query = `SELECT id, date, description, amount, category FROM transactions WHERE 1=1`;
  const params: string[] = [];
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  if (month) {
    query += ` AND substr(date, 1, 7) = ?`;
    params.push(month);
  }
  query += ` ORDER BY date DESC, id DESC LIMIT 500`;

  const transactions = db.prepare(query).all(...params);
  return NextResponse.json({ transactions });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, category } = body as { id: number; category: string };

  if (!id || !category) {
    return NextResponse.json({ error: "Missing id or category" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`UPDATE transactions SET category = ?, category_locked = 1 WHERE id = ?`).run(
    category,
    id
  );
  return NextResponse.json({ ok: true });
}
