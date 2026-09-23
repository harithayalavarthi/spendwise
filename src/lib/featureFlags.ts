// Lets a new feature merge to main behind a toggle, so main always stays
// deployable/releasable even mid-feature — instead of the feature branch
// sitting unmerged for days while it's finished. Flags are read from
// environment variables so they can be flipped without a code change or
// rebuild (a .env.local entry locally, an env var in CI/Electron).
//
// Naming (see docs/workflow.md#naming-convention): camelCase, named after
// the capability it gates (not a ticket/date/"test"), with the date it was
// added so a stale flag is easy to spot, e.g.:
//   "bankSync", // added 2026-09-22
//
// To add one: put its name in FLAG_NAMES below, then guard the feature with
// isFeatureEnabled("theName") wherever it branches. Once the feature has
// fully shipped and the toggle itself is no longer useful, delete both the
// guard and the entry here — a flag that's always "true" and never removed
// is just dead weight.
const FLAG_NAMES = [
  "bankSync", // added 2026-09-23 — direct bank connections via Plaid
] as const;

export type FeatureFlag = (typeof FLAG_NAMES)[number];

// camelCase -> SCREAMING_SNAKE_CASE, e.g. "bankSync" -> "BANK_SYNC". Found
// broken by actually running the bankSync flag end-to-end: the previous
// version only replaced hyphens, so "bankSync" produced the env var
// FEATURE_BANKSYNC (no underscore at the camelCase boundary) while every
// doc and example — correctly — said FEATURE_BANK_SYNC. Setting the
// documented env var silently did nothing. Covered by a unit-style check in
// the verification steps for any change to this file; there's no test
// suite yet (see docs/coding-standards.md), so re-verify by hand if this
// changes again.
function envVarName(flag: string): string {
  return `FEATURE_${flag.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const name: string = flag;
  // TypeScript already blocks an unregistered name at typed call sites;
  // this is defense-in-depth for a call built from a raw/dynamic string.
  if (!(FLAG_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unregistered feature flag: "${name}" — add it to FLAG_NAMES in featureFlags.ts first.`);
  }
  return process.env[envVarName(name)] === "true";
}
