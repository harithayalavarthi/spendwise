import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaidClient";
import { encrypt } from "@/lib/secretBox";
import { syncPlaidItem } from "@/lib/plaidSync";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { logInfo } from "@/lib/logger";
import { plaidErrorResponse } from "@/lib/plaidRouteError";

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("bankSync")) {
    return NextResponse.json({ error: "Bank sync is not enabled" }, { status: 404 });
  }

  const body = await request.json();
  const { publicToken, institutionName } = body as { publicToken?: string; institutionName?: string };
  if (!publicToken) {
    return NextResponse.json({ error: "Missing publicToken" }, { status: 400 });
  }

  try {
    const client = getPlaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token: accessToken, item_id: itemId } = exchange.data;

    logInfo("plaid-exchange", `Connected item ${itemId}${institutionName ? ` (${institutionName})` : ""}`);

    const db = getDb();
    const { statementId, plaidItemDbId } = db.transaction(() => {
      const statementInfo = db
        .prepare(`INSERT INTO statements (filename, transaction_count, institution, source) VALUES (?, 0, ?, 'plaid')`)
        .run(institutionName ? `Connected: ${institutionName}` : "Connected bank account", institutionName ?? null);
      const newStatementId = statementInfo.lastInsertRowid as number;

      const itemInfo = db
        .prepare(`INSERT INTO plaid_items (item_id, statement_id, access_token_encrypted) VALUES (?, ?, ?)`)
        .run(itemId, newStatementId, encrypt(accessToken));

      return { statementId: newStatementId, plaidItemDbId: itemInfo.lastInsertRowid as number };
    })();

    const result = await syncPlaidItem(plaidItemDbId);
    return NextResponse.json({ statementId, plaidItemDbId, ...result });
  } catch (err) {
    return plaidErrorResponse("plaid-exchange", err);
  }
}
