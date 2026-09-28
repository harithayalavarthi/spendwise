// Helpers for CSV-import tests: load a synthetic fixture from tests/fixtures/.
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");

export function readCsvFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}
