@AGENTS.md

## Workflow

Every change goes through a feature branch and a pull request — never commit
straight to `main`. Use a feature flag ([src/lib/featureFlags.ts](src/lib/featureFlags.ts))
for anything large or risky enough to want an off-switch after shipping.
Full details: [docs/workflow.md](docs/workflow.md).
