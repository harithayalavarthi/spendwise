import { NextRequest, NextResponse } from "next/server";
import { syncPlaidItem } from "@/lib/plaidSync";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { plaidErrorResponse } from "@/lib/plaidRouteError";

// RouteContext<'/api/plaid/sync/[itemId]'> is generated at build/dev time
// from this route's own file path (Next 16's typed route-params helper —
// see node_modules/next/dist/docs/.../route.md's "Route Context Helper"),
// globally available with no import needed.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/plaid/sync/[itemId]">) {
  if (!isFeatureEnabled("bankSync")) {
    return NextResponse.json({ error: "Bank sync is not enabled" }, { status: 404 });
  }

  const { itemId } = await ctx.params;
  const plaidItemDbId = Number(itemId);
  if (!Number.isInteger(plaidItemDbId)) {
    return NextResponse.json({ error: "Invalid itemId" }, { status: 400 });
  }

  try {
    const result = await syncPlaidItem(plaidItemDbId);
    return NextResponse.json(result);
  } catch (err) {
    return plaidErrorResponse("plaid-sync-route", err);
  }
}
