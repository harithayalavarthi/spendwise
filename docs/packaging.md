# Desktop packaging (Electron)

SpendWise ships as a desktop app for macOS (`.dmg`) and Windows (`.exe`),
built and published automatically via GitHub Actions — see
[Cutting a release](#cutting-a-release). This doc covers how the packaging
actually works, for anyone changing it.

## Architecture

```
electron/main.ts     Electron main process — spawns the Next.js server as a
                      child process, opens a window pointed at it, wires up
                      the Ollama IPC handlers.
electron/preload.ts   contextBridge — exposes a minimal window.spendwiseElectron
                      API to the renderer (see src/components/OllamaSetupBanner.tsx).
electron/ollama.ts    Ollama status/pull logic, used by main.ts.
```

The app is **not** a rewrite for Electron — it's the same Next.js app from
`npm run dev`, running as a production server (`output: "standalone"` in
`next.config.ts`) that Electron spawns and points a window at. Concretely:

1. `next build` produces `.next/standalone/server.js` — a self-contained
   server bundle with its own `node_modules` (only what's actually needed at
   runtime, via Next's file tracing).
2. `electron/main.ts` spawns that `server.js` as a child process using
   `ELECTRON_RUN_AS_NODE=1` (runs the bundled Electron binary as a plain
   Node runtime for that one process — the standard way to run an arbitrary
   Node script from Electron without shipping a separate Node binary), with
   `SPENDWISE_DATA_DIR` set to `app.getPath("userData")` (see
   [db.ts](../src/lib/db.ts)'s `DATA_DIR` resolution) so the database lives
   in the OS's proper per-user app-data location, not inside the app bundle.
3. Once the server responds, a `BrowserWindow` loads `http://127.0.0.1:4317/`.

**`better-sqlite3` needed no Electron-specific rebuild** — verified directly
(loaded and ran a query under `ELECTRON_RUN_AS_NODE=1` before assuming
anything): it ships Node-API (N-API) prebuilds, which are ABI-stable across
Node and Electron versions. `@electron/rebuild` is still a devDependency for
safety if a future native dependency isn't N-API-based, but running it today
correctly reports "no native modules found" — nothing to do.

## Building locally

```bash
npm run dist:mac   # macOS only, produces release/SpendWise-<version>-arm64.dmg
npm run dist:win   # run this via Git Bash or WSL on Windows — see caveat below
npm run electron:dev  # launch without packaging, for quick local testing
```

Each `dist:*` script runs `electron:prepare` first (fresh `next build`,
copies `public/` and `.next/static` into the standalone bundle per Next's own
documented standalone-deployment steps, compiles `electron/*.ts` via
`tsconfig.electron.json`), then `electron-builder`.

**Windows caveat**: only the macOS `.dmg` path has actually been built and
run end-to-end (this was developed on macOS). The Windows build is written
correctly by config and reasoning, but has only been *verified* via the
GitHub Actions workflow building on a real `windows-latest` runner, never on
an actual Windows machine locally. If you're on Windows and hit something
this doc doesn't cover, that's the most likely place a gap would be.
`package.json`'s scripts use POSIX shell (`rm -rf`, `cp -r`, `mkdir -p`), so
run them via Git Bash or WSL, not a bare PowerShell/cmd prompt — the CI
workflow does this explicitly (`shell: bash` on every step, since
`windows-latest` ships Git for Windows).

## The `afterPack` hook — why it exists

`electron-builder`'s built-in `extraResources` file-copying applies its own
dependency-aware processing to any `node_modules` folder it's pointed at —
in testing, this **silently dropped `node_modules` entirely** from the
packaged app (found by actually launching the built `.dmg`'s `.app` and
hitting `Cannot find module 'next'` — the build step itself gave no
warning). [`build/afterPack.js`](../build/afterPack.js) replaces that with a
plain recursive `fs.cpSync` of `.next/standalone` into the packaged app's
resources directory: dumb, but predictable — what's on disk in
`.next/standalone` is exactly what ends up in the packaged app.

## Data leak prevention

**Concrete incident during development**: the first `next build` with
`output: "standalone"` copied the *actual local `data/spendwise.db`* — real
financial data present on the build machine at build time — into
`.next/standalone/data/`. Next's file tracing followed `db.ts`'s
`fs.mkdirSync`/`new Database(...)` calls and, because `data/` already
existed on disk at build time, included its literal contents. If that had
made it into a packaged installer, every user downloading the app would
have received a copy of the developer's real financial data.

Three independent layers now prevent this, deliberately redundant:

1. `next.config.ts`'s `outputFileTracingExcludes` — `data/**/*` and
   `**/*.db*` are never traced into `.next/standalone` in the first place.
2. `build/afterPack.js`'s copy filter excludes the same patterns again.
3. `db.ts`'s `SPENDWISE_DATA_DIR` handling means the packaged app never
   writes to a path under the app bundle or build directory anyway — only
   to the OS user-data directory, which no packaging step touches.

**If you change the data directory logic or the build config, re-verify
this specifically** — build once on a machine with real local data present,
then `find .next/standalone -iname "*.db*"` and `find release -iname
"*.db*"` and confirm both are empty. This was caught by doing exactly that,
not by reasoning about the config.

## Ollama setup flow

Chosen deliberately over the alternatives (fully bundling the ~5GB
Ollama+model, or shipping the packaged app without any LLM support at all):
the installer stays small, and [`OllamaSetupBanner.tsx`](../src/components/OllamaSetupBanner.tsx)
guides the user through it on first run — entirely optional, keyword
categorization works with zero setup either way. The app never silently
downloads or executes Ollama's own installer (a real GUI installer needing
user consent on both platforms, admin rights on Windows) — that would be
fragile and is exactly the kind of thing that looks like malware behavior.
Instead: `shell.openExternal()` to Ollama's official download page, and the
app polls `checkOllamaStatus()` to notice once it's installed and running.
Once Ollama itself is up, pulling the model *is* fully automated (a plain
`POST /api/pull` to the local Ollama daemon, streamed progress via IPC) —
that part needs no GUI interaction.

`window.spendwiseElectron` (from `electron/preload.ts`'s `contextBridge`) is
how the shared Next.js codebase knows it's running inside the packaged app;
it's `undefined` in a normal browser, so `OllamaSetupBanner` renders nothing
outside Electron — no behavior change for `npm run dev` or a self-hosted
deployment.

## Code signing (not done)

Both builds are **unsigned**. macOS Gatekeeper will refuse to open the
`.dmg`'s app normally (right-click → Open, or an explicit System Settings
approval, gets past it); Windows SmartScreen will show an "unknown
publisher" warning. Real signing needs a paid Apple Developer account
(~$99/year) for a Developer ID Application certificate, and a code-signing
certificate from a CA (~$100–400/year) for Windows — both are business
decisions, not made here. `electron-builder` picks up signing automatically
once the right certificates/env vars are present; see
[electron.build/code-signing](https://www.electron.build/code-signing).

## Icons

[`build/icon.svg`](../build/icon.svg) is a placeholder (a blue rounded
square with a dollar sign) generated for this build to be complete
end-to-end — swap it for real branding. `build/icon.icns` (macOS) and
`build/icon.ico` (Windows) are generated from it:

```bash
cd build
sips -s format png icon.svg --out icon-1024.png
# ...resize into an .iconset and `iconutil -c icns`, see git history of this
# file for the exact commands, or just rerun make-ico.js after regenerating
# the .iconset the same way for the .ico side:
node make-ico.js
```

## Cutting a release

```bash
git tag v0.2.0
git push origin v0.2.0
```

This triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which builds on real `macos-latest` and `windows-latest` runners (never
cross-compiled) and publishes both installers to this repo's GitHub Release
for that tag via `electron-builder --publish always`. Anyone visiting the
repo's Releases page always finds installers matching the latest tag —
there's no separate "upload the build somewhere" step to forget.
