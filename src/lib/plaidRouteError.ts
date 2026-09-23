import { NextResponse } from "next/server";
import { logWarn } from "./logger";

interface PlaidErrorBody {
  error_code?: string;
  error_message?: string;
}

// A Plaid API call rejects with an Axios error whose response body is
// Plaid's own {error_code, error_message} shape — surface that (or a plain
// Error's message, e.g. the "PLAID_CLIENT_ID not set" guard in
// plaidClient.ts) as a real JSON response instead of letting an uncaught
// throw fall through to Next's generic empty 500, which gave no way to
// tell "Plaid isn't configured" from "Plaid rejected the request" from the
// browser's network tab.
export function plaidErrorResponse(scope: string, err: unknown): NextResponse {
  const body = (err as { response?: { data?: PlaidErrorBody } })?.response?.data;
  const message = body?.error_message ?? (err instanceof Error ? err.message : String(err));
  logWarn(scope, `Plaid request failed: ${message}`, body?.error_code ?? "");
  return NextResponse.json({ error: message }, { status: 500 });
}
