import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "storybook.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "characters"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "covers"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "illustrations"), {
  recursive: true,
});

const db: import("better-sqlite3").Database = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function getUploadsDir(): string {
  return path.join(DATA_DIR, "uploads");
}

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'family',
      notes TEXT NOT NULL DEFAULT '',
      photo_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_image_path TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      image_path TEXT,
      image_status TEXT NOT NULL DEFAULT 'done',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pages_book_id ON pages(book_id);
    CREATE INDEX IF NOT EXISTS idx_characters_updated ON characters(updated_at);
    CREATE INDEX IF NOT EXISTS idx_books_updated ON books(updated_at);
    CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at);
  `);
}

export default db;
