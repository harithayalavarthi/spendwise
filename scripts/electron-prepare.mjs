#!/usr/bin/env node
// Cross-platform replacement for a POSIX shell chain (rm -rf, cp -r, mkdir -p)
// that a Windows CI run showed does NOT reliably stay in Git Bash — the
// nested `npm run electron:compile` step failed with a plain Windows shell
// error ("The syntax of the command is incorrect.") even though the outer
// GitHub Actions step was configured with `shell: bash`. Node's own
// child_process/fs APIs sidestep the question of which shell npm picks
// entirely, on every platform.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

fs.rmSync(standalone, { recursive: true, force: true });
fs.rmSync(path.join(root, "dist-electron"), { recursive: true, force: true });

run("next build");

fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
fs.mkdirSync(path.join(standalone, ".next"), { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

run("tsc -p tsconfig.electron.json");
