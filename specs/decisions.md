# SpendWise — Architecture Decision Log

Recorded retroactively on 2026-09-27 from the README, `docs/`, and the code;
the "Date" is when the decision was recorded here, not necessarily when it was
made. New decisions get a new ADR; to change one, add an ADR that supersedes it.

---

## ADR-001 — Local-first: SQLite on the user's machine
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** All data lives in a local SQLite database (`better-sqlite3`):
`data/spendwise.db` from source, the OS user-data folder in the desktop app.
No server, no account.

**Consequences.** Financial data never leaves the machine by default (NFR-1);
nothing to host or pay for. No sync between devices. Any outbound data flow
(Plaid, Nudge) is an explicit, opt-in, documented exception (ADR-005, ADR-008).

---

## ADR-002 — Layered categorization with a local LLM that sees only descriptions
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** Keyword rules → merchant cache → local Ollama model → amount-sign
fallback. The LLM receives only the description, runs on `localhost` at
`temperature: 0`, and every result is cached per merchant; manual corrections
override the cache.

**Consequences.** Most transactions cost nothing to categorize; unknown
merchants get a private best guess; the app works without Ollama. Local models
still misjudge some regional merchants (smaller models more so).

---

## ADR-003 — One Next.js codebase for web and desktop (Electron)
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** The Electron app runs the same Next.js server as `npm run dev`,
as a spawned child process, with the database path set to the OS user-data
folder. See [docs/packaging.md](../docs/packaging.md) for its incident history.

**Consequences.** No separate desktop codebase. Some Electron-only APIs (e.g.
OS keychain via `safeStorage`) aren't reachable from the Next.js process
(ADR-006).

---

## ADR-004 — Duplicate detection by content hash
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** A hash of (date, description, amount) identifies a transaction;
duplicates are skipped at import.

**Consequences.** Re-uploads and overlapping exports are safe. Two genuinely
identical same-day transactions collapse into one (accepted, documented).

---

## ADR-005 — Plaid bank sync as an opt-in, flagged exception
**Date:** 2026-09-27 (retroactive; built 2026-09-23) · **Status:** Accepted

**Decision.** Direct bank connections via Plaid, behind the `bankSync` flag and
off by default; a connection is modeled as a `statements` row with
`source = 'plaid'`; Sandbox only for now. See
[docs/plaid-bank-sync.md](../docs/plaid-bank-sync.md).

**Consequences.** Reuses delete/institution/count behavior for free. The first
feature where data passes through a third party — hence the flag and doc.

---

## ADR-006 — App-level encryption for Plaid tokens (not the OS keychain)
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** AES-256-GCM with a random key in a `0600` file beside the database.

**Consequences.** Works identically in dev and desktop, no cross-process bridge.
Weaker than the OS keychain (anything that can read the user's files can read
both); keychain integration remains possible hardening (BANK-9).

---

## ADR-007 — Manual + on-load sync instead of webhooks
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted

**Decision.** Plaid sync runs on "Sync now" and best-effort when the Accounts
page loads.

**Consequences.** No public endpoint needed (a local app can't receive
webhooks). Data is only as fresh as the last sync.

---

## ADR-008 — Nudge link: SpendWise pushes minimal signals
**Date:** 2026-09-27 (mirrors Nudge ADR-009, 2026-09-23) · **Status:** Accepted, not built

**Decision.** For the Nudge integration, SpendWise pushes a closed-schema set of
signals (merchant name, rounded amount, currency, cadence, dates; never
transactions, descriptions, accounts, or balances) to Nudge after each import,
authenticated by a revocable per-member token obtained by pairing; behind its
own feature flag. Requirements INT-1…8.

**Consequences.** Keeps SpendWise local-first with a documented, opt-in
exception. Signals are only as fresh as the last import. Requires BUG-1 and
DASH-7 first.

---

## ADR-009 — Unsigned desktop builds (for now)
**Date:** 2026-09-27 (retroactive) · **Status:** Accepted, revisit (OQ-3)

**Decision.** Ship unsigned `.dmg`/`.exe`; `electron-builder` will sign
automatically once certificates are provided.

**Consequences.** No certificate costs; users see Gatekeeper/SmartScreen
warnings. Fine while the owner runs from source.
