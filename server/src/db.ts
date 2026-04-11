import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(REPO_ROOT, process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "storybook.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "characters"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "covers"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "illustrations"), {
  recursive: true,
});
fs.mkdirSync(path.join(DATA_DIR, "uploads", "locations"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads", "elements"), { recursive: true });

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
      include_by_default INTEGER NOT NULL DEFAULT 0,
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
      hidden INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      progress_message TEXT,
      progress_fraction REAL DEFAULT 0,
      total_steps INTEGER DEFAULT 0,
      completed_steps INTEGER DEFAULT 0,
      first_illustration_ready INTEGER DEFAULT 0,
      completed_page_ids TEXT,
      error_message TEXT,
      request_payload TEXT,
      started_at INTEGER,
      heartbeat_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_updated ON generation_jobs(updated_at);

    CREATE TABLE IF NOT EXISTS generation_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      book_id TEXT,
      page_id TEXT,
      step_type TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      system_prompt TEXT,
      character_refs_json TEXT,
      num_images_attached INTEGER DEFAULT 0,
      had_reference_image INTEGER DEFAULT 0,
      response_text TEXT,
      response_model TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_logs_book ON generation_logs(book_id);
    CREATE INDEX IF NOT EXISTS idx_generation_logs_job ON generation_logs(job_id);

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS location_photos (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      photo_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_locations_updated ON locations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_location_photos_location ON location_photos(location_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER DEFAULT 0
    );
  `);

  // Migration: add hidden column to books (safe to run on existing DBs)
  try {
    db.exec("ALTER TABLE books ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already exists
  }

  // Migration: add include_by_default column to characters
  try {
    db.exec("ALTER TABLE characters ADD COLUMN include_by_default INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already exists
  }

  // Startup recovery: mark orphaned in-progress jobs as error
  db.prepare(`
    UPDATE generation_jobs
    SET status = 'error', error_message = 'Server restarted during generation', updated_at = ?
    WHERE status NOT IN ('done', 'error', 'cancelled', 'pending')
  `).run(Date.now());

  // Cleanup: delete completed/errored jobs older than 24 hours
  db.prepare(`
    DELETE FROM generation_jobs
    WHERE status IN ('done', 'error', 'cancelled')
    AND created_at < ?
  `).run(Date.now() - 24 * 60 * 60 * 1000);
}

export default db;
