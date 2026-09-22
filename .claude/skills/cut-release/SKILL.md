---
name: cut-release
description: Cut a new SpendWise desktop release (macOS .dmg + Windows .exe) and verify it actually published correctly. Use this when asked to release, publish, ship, or tag a new version of the desktop app.
---

# Cutting a SpendWise release

Full architecture and history in [docs/packaging.md](../../docs/packaging.md)
— this skill is the operational steps, plus two failure modes that have
actually happened before, so they get caught immediately rather than
rediscovered.

## 1. Bump the version and merge it to main first

```json
// package.json
"version": "0.3.0"
```

This goes through the normal branch → PR → merge flow (see the
`start-feature` skill) like any other change — don't tag a commit that
hasn't been merged to `main`.

## 2. Tag and push, from main, after the bump is merged

```bash
git checkout main && git pull
git tag v0.3.0
git push origin v0.3.0
```

This triggers [.github/workflows/release.yml](../../.github/workflows/release.yml).

## 3. Watch it

```bash
gh run list --workflow=release.yml --limit 3
gh run view <run-id>              # summary
gh run view <run-id> --log-failed # full output of whatever failed, if anything
```

Three jobs: `create-release` (fast, creates the GitHub Release up front),
then `release (macos-latest)` and `release (windows-latest)` in parallel.

## 4. Verify the actual release, not just "the workflow went green"

A green workflow run is necessary but not sufficient — verify the release
itself:

```bash
gh release view v0.3.0 --repo <owner>/<repo>
```

Confirm:
- `draft: false`
- Exactly six assets: `SpendWise-<version>-arm64.dmg`, `.dmg.blockmap`,
  `latest-mac.yml`, `SpendWise-Setup-<version>.exe`, `.exe.blockmap`,
  `latest.yml`

If anything looks wrong, check for **duplicate releases** for the same tag:

```bash
gh api repos/<owner>/<repo>/releases --jq '.[] | select(.tag_name=="v0.3.0") | {id, draft}'
```

More than one result means the `create-release` job didn't run before the
platform jobs (or was skipped/failed) and they raced — this exact race
happened on `v0.2.0`'s first release and is why `create-release` exists as
its own job with `needs:` on both platform jobs. If it recurs, that job is
the place to look, not the platform builds themselves.

## Known failure modes (don't re-diagnose these from scratch)

- **`"The syntax of the command is incorrect."` on the Windows job**: this
  is a Windows-native shell error, not a bash one — it means something in
  `electron:prepare` reverted to a POSIX shell assumption. The whole prepare
  step is a plain Node script (`scripts/electron-prepare.js`) specifically
  to avoid this; if it reappears, something reintroduced a shell chain.
  Also check whether the failing run is actually a **re-run of an old run**
  pinned to a stale commit (`gh api repos/.../actions/runs/<id> --jq .head_sha`)
  — re-running an old failed job re-checks-out its original commit, not
  latest `main`, so an already-fixed bug can look like it "failed again."
  Trigger a fresh run instead: `gh workflow run release.yml`.
- **Draft release invisible on the public Releases page**: `electron-builder`'s
  own default is `releaseType: "draft"` — this repo overrides it to
  `"release"` in `package.json`'s `build.publish` config. That override only
  applies when a release is *created*; if one already exists as a draft
  (e.g. from a race before `create-release` existed), publish it manually:
  `gh api -X PATCH repos/<owner>/<repo>/releases/<id> -f draft=false`.
