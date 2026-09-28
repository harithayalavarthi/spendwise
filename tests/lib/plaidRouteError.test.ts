// plaidErrorResponse: how a failed Plaid call becomes a JSON API response
// (used by the /api/plaid/* routes). Error shapes below are synthetic.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { plaidErrorResponse } from "@/lib/plaidRouteError";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("plaidErrorResponse", () => {
  it("surfaces Plaid's own error_message from an Axios-style rejection, as a JSON 500", async () => {
    const err = Object.assign(new Error("Request failed with status code 400"), {
      response: {
        status: 400,
        data: { error_code: "INVALID_PUBLIC_TOKEN", error_message: "provided public token is in an invalid format" },
      },
    });

    const res = plaidErrorResponse("plaid-exchange", err);

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "provided public token is in an invalid format" });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[plaid-exchange] Plaid request failed: provided public token is in an invalid format"),
      "INVALID_PUBLIC_TOKEN",
    );
  });

  it("falls back to a plain Error's message (e.g. Plaid not configured)", async () => {
    const res = plaidErrorResponse("plaid-link-token", new Error("PLAID_CLIENT_ID / PLAID_SECRET are not set"));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "PLAID_CLIENT_ID / PLAID_SECRET are not set" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[plaid-link-token]"), "");
  });

  it("uses the Error message when the Axios response body has no error_message", async () => {
    const err = Object.assign(new Error("socket hang up"), { response: { data: {} } });
    expect(await plaidErrorResponse("s", err).json()).toEqual({ error: "socket hang up" });
  });

  it("stringifies a non-Error rejection", async () => {
    expect(await plaidErrorResponse("s", "boom").json()).toEqual({ error: "boom" });
    expect(await plaidErrorResponse("s", undefined).json()).toEqual({ error: "undefined" });
    expect(await plaidErrorResponse("s", null).json()).toEqual({ error: "null" });
  });

  it("returns only the message — never the request config (which holds the access token)", async () => {
    const err = Object.assign(new Error("Request failed"), {
      config: { data: JSON.stringify({ access_token: "access-sandbox-deadbeef" }) },
      response: { data: { error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required" } },
    });
    const res = plaidErrorResponse("plaid-sync-route", err);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "login required" }));
    expect(text).not.toContain("access-sandbox");
    const logged = vi.mocked(console.warn).mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("access-sandbox");
  });
});
