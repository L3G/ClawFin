import Database from "better-sqlite3";
import { DB_PATH, ensureDataDir } from "@clawfin/shared";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY,
      institution_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      subtype TEXT,
      mask TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      name TEXT NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS holdings (
      account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      security_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      value REAL NOT NULL,
      timestamp TEXT NOT NULL,
      PRIMARY KEY (account_id, security_id)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      item_id TEXT PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
      cursor TEXT NOT NULL DEFAULT '',
      last_sync TEXT NOT NULL
    );
  `);
}
