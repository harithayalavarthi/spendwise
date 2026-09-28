# SpendWise — Roadmap

Open items from [requirements.md](requirements.md), in suggested order. Each
item is a branch + PR (`start-feature` skill); anything spanning several PRs or
changing the privacy story gets a feature flag.

## Now — correctness and safety net

1. **Tests for the parsing core (NFR-6, OQ-5).** Add Vitest with fixture
   statements (synthetic, never real data) covering each supported CSV/PDF
   format, sign conventions, boilerplate filtering, duplicate detection, and
   recurring detection. Doing this first makes BUG-1 safe to fix.
2. **Fix BUG-1 — Scotiabank sign (IMP-7).** When the owner is ready (OQ-1):
   read the CSV's debit/credit type column, add a fixture test, and decide how
   to correct the 67 existing rows (re-import vs. a one-off migration).
3. **CI on pull requests (NFR-7).** Typecheck, lint, build, and tests on every PR.

## Next — prerequisites for the Nudge link

4. **Currency per institution (DASH-7).** Store and show USD/CAD per statement;
   keep totals per currency rather than mixing them.
5. **Stable suggestion IDs (INT-1), per-merchant subscriptions (INT-2),
   price-increase detection (INT-3).** Useful on the dashboard on their own.

## Then — Nudge milestone M5 (behind a new flag)

6. **Signal outbox + sync (INT-5), pairing/consent settings (INT-6), privacy
   docs (INT-7).** Coordinated with Nudge's M5; exit test in Nudge's roadmap.

## Later / decisions pending

- `bankSync` flag: keep as a permanent opt-in or retire (BANK-10, OQ-4).
- Plaid Production — real banks (BANK-7, OQ-2).
- Code signing (DESK-4, OQ-3).
- OS-keychain token encryption (BANK-9); webhooks (BANK-8) stay out of scope
  for a local app.
