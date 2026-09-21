import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CATEGORIES, type Category } from "@/lib/categories";
import { getMerchantKey, saveMerchantCategory } from "@/lib/merchantCache";

const MAX_RESULTS = 500;

export async function GET(request: NextRequest) {
  const db = getDb();
  const category = request.nextUrl.searchParams.get("category");
  const month = request.nextUrl.searchParams.get("month");

  let where = ` WHERE 1=1`;
  const params: string[] = [];
  if (category) {
    where += ` AND category = ?`;
    params.push(category);
  }
  if (month) {
    where += ` AND substr(date, 1, 7) = ?`;
    params.push(month);
  }

  const total = db.prepare(`SELECT COUNT(*) AS count FROM transactions${where}`).get(...params) as {
    count: number;
  };
  const transactions = db
    .prepare(
      `SELECT id, date, description, amount, category FROM transactions${where} ORDER BY date DESC, id DESC LIMIT ${MAX_RESULTS}`
    )
    .all(...params);

  return NextResponse.json({ transactions, total: total.count });
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
  const existing = db.prepare(`SELECT description FROM transactions WHERE id = ?`).get(id) as
    | { description: string }
    | undefined;

  db.prepare(`UPDATE transactions SET category = ?, category_locked = 1 WHERE id = ?`).run(
    category,
    id
  );

  // Teach the merchant cache from this correction so future imports of the
  // same merchant (via keyword miss -> LLM/cache fallback) get it right
  // immediately, without waiting on another LLM call.
  if (existing) {
    saveMerchantCategory(getMerchantKey(existing.description), category as Category, "user");
  }

  return NextResponse.json({ ok: true });
}
