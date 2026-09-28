// Feature flags (docs/workflow.md "Feature flags"; bankSync gates BANK-1).
// tests/setup.ts clears every FEATURE_* variable before this file runs.
import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled, type FeatureFlag } from "@/lib/featureFlags";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("FEATURE_") && !(key in saved)) delete process.env[key];
  }
});

describe("isFeatureEnabled", () => {
  it("is off by default", () => {
    expect(process.env.FEATURE_BANK_SYNC).toBeUndefined();
    expect(isFeatureEnabled("bankSync")).toBe(false);
  });

  it('reads FEATURE_BANK_SYNC (camelCase -> SCREAMING_SNAKE_CASE) and is on only for exactly "true"', () => {
    process.env.FEATURE_BANK_SYNC = "true";
    expect(isFeatureEnabled("bankSync")).toBe(true);
  });

  it("ignores the old underscore-less name FEATURE_BANKSYNC (the bug fixed in featureFlags.ts)", () => {
    process.env.FEATURE_BANKSYNC = "true";
    expect(isFeatureEnabled("bankSync")).toBe(false);
  });

  it.each(["", "false", "0", "1", "yes", "on", "TRUE", "True", " true", "true "])(
    'treats FEATURE_BANK_SYNC=%j as off (only the exact string "true" enables)',
    (value) => {
      process.env.FEATURE_BANK_SYNC = value;
      expect(isFeatureEnabled("bankSync")).toBe(false);
    },
  );

  it("is re-read on every call, so flipping the env var takes effect without a reload", () => {
    process.env.FEATURE_BANK_SYNC = "true";
    expect(isFeatureEnabled("bankSync")).toBe(true);
    delete process.env.FEATURE_BANK_SYNC;
    expect(isFeatureEnabled("bankSync")).toBe(false);
  });

  it("throws for an unregistered flag name built from a raw string", () => {
    process.env.FEATURE_NOT_A_FLAG = "true";
    expect(() => isFeatureEnabled("notAFlag" as FeatureFlag)).toThrow(/Unregistered feature flag: "notAFlag"/);
  });
});
