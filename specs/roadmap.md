# SpendWise — Roadmap

Open items from [requirements.md](requirements.md), in suggested order. Each
item is a branch + PR (`start-feature` skill); anything spanning several PRs or
changing the privacy story gets a feature flag.

## Now — correctness and safety net

1. ~~**Tests (NFR-6)**~~ Done — 428 tests across import, categorization,
   analytics, and Plaid; they found BUG-2…BUG-15.
2. **Fix the defects in priority order** (requirements §3, issues #11–#25):
   ~~**BUG-15** (secret in logs)~~ fixed 2026-09-28; then the High ones that distort real
   numbers today — **BUG-1** (Scotiabank signs; agree how to correct the 67
   stored rows), **BUG-2**, **BUG-6**, **BUG-10**, **BUG-12**; then Medium
   (BUG-3, 7, 8, 9, 14) and Low (BUG-4, 5, 11, 13). Each fix flips its pinned
   `it.fails` test.
3. ~~**CI on pull requests (NFR-7).**~~ Done — typecheck, lint, tests, and build on every PR.

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
