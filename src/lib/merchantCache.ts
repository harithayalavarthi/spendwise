import { getDb } from "./db";
import type { Category } from "./categories";

// Reduces a description to a stable key so recurring charges from the same
// merchant (different reference numbers, dates, card-processor prefixes)
// hit the same cache entry instead of triggering a fresh LLM call each time.
export function getMerchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/#?\d{3,}/g, "") // strip long digit runs: ref numbers, store numbers
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupMerchantCategory(merchantKey: string): Category | null {
  if (!merchantKey) return null;
  const db = getDb();
  const row = db
    .prepare(`SELECT category FROM merchant_categories WHERE merchant_key = ?`)
    .get(merchantKey) as { category: Category } | undefined;
  return row?.category ?? null;
}

export function saveMerchantCategory(
  merchantKey: string,
  category: Category,
  source: "llm" | "user"
): void {
  if (!merchantKey) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO merchant_categories (merchant_key, category, source, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(merchant_key) DO UPDATE SET
       category = excluded.category,
       source = excluded.source,
       updated_at = excluded.updated_at
     WHERE source != 'user' OR excluded.source = 'user'`
  ).run(merchantKey, category, source);
}
