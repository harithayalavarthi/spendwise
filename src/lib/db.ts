import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { transactionHash } from "./dedupe";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "spendwise.db");

declare global {
  var __spendwiseDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      transaction_count INTEGER NOT NULL DEFAULT 0,
      institution TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      category_locked INTEGER NOT NULL DEFAULT 0,
      hash TEXT,
      institution TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_institution ON transactions(institution);

    -- Learned merchant -> category mappings, so an LLM classification (or a
    -- user's manual correction) only has to happen once per merchant.
    CREATE TABLE IF NOT EXISTS merchant_categories (
      merchant_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateHashColumn(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash);`);
  migrateInstitutionColumn(db);

  return db;
}

// Older databases created before duplicate detection was added won't have the
// `hash` column yet — add it and backfill existing rows.
function migrateHashColumn(db: Database.Database) {
  const columns = db.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === "hash")) return;

  db.exec(`ALTER TABLE transactions ADD COLUMN hash TEXT`);
  const rows = db
    .prepare(`SELECT id, date, description, amount FROM transactions`)
    .all() as Array<{ id: number; date: string; description: string; amount: number }>;
  const update = db.prepare(`UPDATE transactions SET hash = ? WHERE id = ?`);
  const backfill = db.transaction(() => {
    for (const row of rows) {
      update.run(transactionHash(row.date, row.description, row.amount), row.id);
    }
  });
  backfill();
}

// Older databases created before the institution field was added won't have
// these columns yet.
function migrateInstitutionColumn(db: Database.Database) {
  const statementCols = db.prepare(`PRAGMA table_info(statements)`).all() as Array<{ name: string }>;
  if (!statementCols.some((c) => c.name === "institution")) {
    db.exec(`ALTER TABLE statements ADD COLUMN institution TEXT`);
  }

  const txnCols = db.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>;
  if (!txnCols.some((c) => c.name === "institution")) {
    db.exec(`ALTER TABLE transactions ADD COLUMN institution TEXT`);
  }
}

export function getDb(): Database.Database {
  if (!global.__spendwiseDb) {
    global.__spendwiseDb = createDb();
  }
  return global.__spendwiseDb;
}
