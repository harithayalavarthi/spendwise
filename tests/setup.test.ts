// Guards for the test harness itself: if these fail, nothing else is safe to run.
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { seedStatement, seedTransactions } from "./helpers/db";

describe("test harness", () => {
  it("points the app at a throwaway database, never the real data/ directory", () => {
    const dir = path.resolve(process.env.SPENDWISE_DATA_DIR ?? "");
    expect(dir.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    expect(dir).not.toBe(path.resolve(process.cwd(), "data"));
    const dbFile = getDb().name;
    expect(dbFile.startsWith(dir)).toBe(true);
  });

  it("starts each test file with an empty database", () => {
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 0 });
  });

  it("can seed synthetic rows", () => {
    const id = seedStatement("synthetic.csv", "Test Bank");
    seedTransactions(id, [{ date: "2026-01-05", description: "COFFEE SHOP", amount: -4.5, category: "Dining" }]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 1 });
  });

  it("blocks the network unless a test stubs fetch", () => {
    expect(() => fetch("https://example.com")).toThrow(/Network access is disabled/);
  });
});
