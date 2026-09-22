// Lets a new feature merge to main behind a toggle, so main always stays
// deployable/releasable even mid-feature — instead of the feature branch
// sitting unmerged for days while it's finished. Flags are read from
// environment variables so they can be flipped without a code change or
// rebuild (a .env.local entry locally, an env var in CI/Electron).
//
// To add one: put its name in FLAG_NAMES below, then guard the feature with
// isFeatureEnabled("theName") wherever it branches. Once the feature has
// fully shipped and the toggle itself is no longer useful, delete both the
// guard and the entry here — a flag that's always "true" and never removed
// is just dead weight.
const FLAG_NAMES = [] as const;

export type FeatureFlag = (typeof FLAG_NAMES)[number];

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // Cast needed because FLAG_NAMES starts empty (FeatureFlag is `never`
  // until a flag is registered) — the function body still needs to compile.
  const name = flag as string;
  return process.env[`FEATURE_${name.toUpperCase().replace(/-/g, "_")}`] === "true";
}
