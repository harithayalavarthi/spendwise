import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/featureFlags";

export async function GET() {
  if (!isFeatureEnabled("bankSync")) {
    return NextResponse.json({ error: "Bank sync is not enabled" }, { status: 404 });
  }

  const db = getDb();
  const items = db
    .prepare(
      `SELECT
         pi.id AS itemDbId,
         s.id AS statementId,
         s.institution,
         s.transaction_count AS transactionCount,
         pi.last_synced_at AS lastSyncedAt,
         pi.created_at AS connectedAt
       FROM plaid_items pi
       JOIN statements s ON s.id = pi.statement_id
       ORDER BY pi.created_at DESC`
    )
    .all();

  return NextResponse.json({ items });
}
