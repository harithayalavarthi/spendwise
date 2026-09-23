import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// PLAID_ENV defaults to sandbox (fake institutions, fake transactions, free,
// no real bank credentials needed) — see docs/plaid-bank-sync.md for why
// this app is built and verified against Sandbox before Production (real
// banks) is ever considered; that's a separate later decision requiring the
// user's own Plaid account and current pricing, not something this code
// assumes.
const env = process.env.PLAID_ENV ?? "sandbox";

function client(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error(
      "PLAID_CLIENT_ID / PLAID_SECRET are not set — see docs/plaid-bank-sync.md for how to get free Sandbox keys."
    );
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

// Lazy — constructing this eagerly at module load would throw in any
// codepath that imports this file before env vars are configured (e.g. a
// build step), even when Plaid isn't actually being used.
let cached: PlaidApi | null = null;
export function getPlaidClient(): PlaidApi {
  if (!cached) cached = client();
  return cached;
}
