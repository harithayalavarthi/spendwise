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
  const { code, message } = plaidErrorParts(err);
  logWarn(scope, `Plaid request failed: ${message}`, code);
  return NextResponse.json({ error: message }, { status: 500 });
}

// Never log a Plaid error object itself: the client rejects with an Axios
// error whose `config.data` is the request body (a decrypted access token)
// and whose `config.headers` carry PLAID-CLIENT-ID / PLAID-SECRET (BUG-15).
// Only Plaid's error code and message — or a plain Error's message — are safe.
export function plaidErrorSummary(err: unknown): string {
  const { code, message } = plaidErrorParts(err);
  return code ? `${code}: ${message}` : message;
}

function plaidErrorParts(err: unknown): { code: string; message: string } {
  const body = (err as { response?: { data?: PlaidErrorBody } })?.response?.data;
  const message = body?.error_message ?? (err instanceof Error ? err.message : String(err));
  return { code: body?.error_code ?? "", message };
}
