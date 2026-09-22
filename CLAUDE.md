@AGENTS.md

## Workflow

Every change goes through a feature branch and a pull request — never commit
straight to `main`. Use a feature flag ([src/lib/featureFlags.ts](src/lib/featureFlags.ts))
for anything large or risky enough to want an off-switch after shipping.
Full details: [docs/workflow.md](docs/workflow.md).

Before writing code, read [docs/coding-standards.md](docs/coding-standards.md)
— this project's actual TypeScript/comment/logging/file-organization
conventions and non-negotiable privacy invariants, not generic defaults.

## Skills

`.claude/skills/` has project-specific playbooks for recurring tasks —
`start-feature` (branch/flag/PR mechanics for any change), `cut-release`
(tagging and verifying a desktop release, including known CI failure modes),
`add-bank` (adding auto-detection for a new financial institution's
statements). Use the matching one instead of improvising when the task fits.

## Reference docs

[docs/database-schema.md](docs/database-schema.md) (schema, migrations,
known data issues), [docs/packaging.md](docs/packaging.md) (Electron/release
architecture and its incident history).
