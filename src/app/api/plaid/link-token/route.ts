import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaidClient";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { plaidErrorResponse } from "@/lib/plaidRouteError";

// Single-user local app — there's only ever one user per database, so a
// fixed id is fine (Plaid requires *some* stable client_user_id, it isn't
// used for anything else here).
const CLIENT_USER_ID = "spendwise-local-user";

export async function POST() {
  if (!isFeatureEnabled("bankSync")) {
    return NextResponse.json({ error: "Bank sync is not enabled" }, { status: 404 });
  }

  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      client_name: "SpendWise",
      language: "en",
      country_codes: [CountryCode.Us, CountryCode.Ca],
      user: { client_user_id: CLIENT_USER_ID },
      products: [Products.Transactions],
    });
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    return plaidErrorResponse("plaid-link-token", err);
  }
}
