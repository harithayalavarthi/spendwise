// DOC-1: the architecture and database docs are the "big picture" a newcomer
// (human or agent) reads first, so they must not drift from the code. These
// tests fail when a module, route, page, component, table, or column exists in
// the code but isn't named in the docs — update the doc in the same PR.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";

const root = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function listFiles(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(rel, match));
    else if (match.test(entry.name)) out.push(rel);
  }
  return out;
}

function missingFrom(doc: string, names: string[]): string[] {
  return names.filter((name) => !doc.includes(`\`${name}\``));
}

describe("docs/architecture.md (DOC-1)", () => {
  const doc = read("docs/architecture.md");

  it("names every src/lib module", () => {
    const modules = fs.readdirSync(path.join(root, "src/lib")).filter((f) => f.endsWith(".ts"));
    expect(missingFrom(doc, modules)).toEqual([]);
  });

  it("names every API route", () => {
    const routes = listFiles("src/app/api", /^route\.ts$/).map((f) => path.posix.dirname(f).replace(/^src\/app\//, ""));
    expect(missingFrom(doc, routes)).toEqual([]);
  });

  it("names every page and the root layout", () => {
    const pages = listFiles("src/app", /^(page|layout)\.tsx$/).map((f) => f.replace(/^src\/app\//, ""));
    expect(missingFrom(doc, pages)).toEqual([]);
  });

  it("names every component", () => {
    const components = fs
      .readdirSync(path.join(root, "src/components"))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => f.replace(/\.tsx?$/, ""));
    expect(missingFrom(doc, components)).toEqual([]);
  });

  it("names every Electron file and script", () => {
    const files = [...listFiles("electron", /\.ts$/), ...listFiles("scripts", /\.(ts|mjs|js)$/)];
    expect(missingFrom(doc, files)).toEqual([]);
  });
});

describe("docs/database-schema.md (DOC-1)", () => {
  const doc = read("docs/database-schema.md");
  // tests/setup.ts points getDb() at a throwaway directory, so this is a fresh
  // database with every migration applied — the schema the app actually runs.
  const db = getDb();
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  ).map((t) => t.name);

  // The text of one table's "### `name`" section, up to the next heading.
  function section(table: string): string {
    const start = doc.indexOf(`### \`${table}\``);
    if (start === -1) return "";
    const next = doc.slice(start + 1).search(/\n#{2,3} /);
    return next === -1 ? doc.slice(start) : doc.slice(start, start + 1 + next);
  }

  it("has a section for every table", () => {
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => section(t) === "")).toEqual([]);
  });

  it.each(tables)("documents every column of %s in its table and the diagram", (table) => {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    const body = section(table);
    expect(columns.filter((c) => !body.includes(`| \`${c}\``))).toEqual([]);

    const diagram = doc.match(new RegExp(`\\n\\s*${table.toUpperCase()} \\{([^}]*)\\}`))?.[1] ?? "";
    expect(columns.filter((c) => !new RegExp(`\\s${c}(\\s|$)`).test(diagram))).toEqual([]);
  });
});
