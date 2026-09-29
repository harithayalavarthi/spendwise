<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SpendWise — instructions for any AI coding agent

This file is the single source of truth for Claude, GitHub Copilot, Gemini,
Codex, and any other agent (the Next.js block above is maintained by `next dev`;
edit only outside it). `CLAUDE.md`, `GEMINI.md`, and
`.github/copilot-instructions.md` just point here. Keep project knowledge here,
in `specs/`, or in `docs/` — not in one tool's private memory — so switching
tools doesn't mean re-reading the whole codebase.

## Workflow

Every change goes through a feature branch and a pull request — never commit
straight to `main`. Use a feature flag ([src/lib/featureFlags.ts](src/lib/featureFlags.ts))
for anything large or risky enough to want an off-switch after shipping.
Full details: [docs/workflow.md](docs/workflow.md).

Before writing code, read [docs/coding-standards.md](docs/coding-standards.md)
— this project's actual TypeScript/comment/logging/file-organization
conventions and non-negotiable privacy invariants, not generic defaults.

## Playbooks

`.claude/skills/<name>/SKILL.md` are plain-Markdown playbooks for recurring tasks (any agent can follow them) —
`start-feature` (branch/flag/PR mechanics for any change), `cut-release`
(tagging and verifying a desktop release, including known CI failure modes),
`add-bank` (adding auto-detection for a new financial institution's
statements). Use the matching one instead of improvising when the task fits.

## Reference docs

[docs/architecture.md](docs/architecture.md) — the whole-app picture: diagram, every
module/route/page, request flows, and "where to change what". Start here when you
don't know which file to touch. It and [docs/database-schema.md](docs/database-schema.md)
must be updated in the same PR as any component, table, or column change (DOC-1);
`tests/docs.test.ts` fails if they drift.

[specs/](specs/README.md) — requirements with IDs and status (Built/Partial/Open),
decisions, and the roadmap of open work. Update the relevant requirement in the
same PR as the change, and reference its ID.

[docs/database-schema.md](docs/database-schema.md) (schema, migrations,
known data issues), [docs/packaging.md](docs/packaging.md) (Electron/release
architecture and its incident history), [docs/plaid-bank-sync.md](docs/plaid-bank-sync.md)
(direct bank connections — architecture, the privacy tradeoff, why it's
app-level token encryption not OS-keychain, sign-convention gotcha).
