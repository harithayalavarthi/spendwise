import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Runs before every test file: points the app at a throwaway database and
    // blocks the network. See tests/setup.ts — this is what keeps the real
    // data/spendwise.db untouchable from tests.
    setupFiles: ["tests/setup.ts"],
    // Each test file gets a fresh module registry, so the db.ts singleton (and
    // its throwaway database) never leaks between files.
    isolate: true,
    restoreMocks: true,
    unstubGlobals: false,
  },
});
