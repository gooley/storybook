import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

interface SyncEntity {
  id: string;
  [key: string]: any;
}

// Get all changes since a timestamp (for Android pull)
router.get("/changes", (req: Request, res: Response) => {
  const since = parseInt(req.query.since as string) || 0;

  const characters = db
    .prepare("SELECT * FROM characters WHERE updated_at > ?")
    .all(since);
  const books = db
    .prepare("SELECT * FROM books WHERE updated_at > ?")
    .all(since);
  const pages = db
    .prepare("SELECT * FROM pages WHERE updated_at > ?")
    .all(since);

  // Return in dependency order: characters first, then books, then pages
  // This ensures Android can resolve book_id FK when inserting pages
  res.json({
    characters,
    books,
    pages,
    server_time: Date.now(),
  });
});

// Push changes from device (Android push)
router.post("/push", (req: Request, res: Response) => {
  const { characters, books, pages } = req.body;
  const results = { characters: 0, books: 0, pages: 0 };

  const upsertCharacter = db.prepare(
    `INSERT INTO characters (id, name, type, notes, photo_path, include_by_default, created_at, updated_at, deleted_at)
     VALUES (@id, @name, @type, @notes, @photo_path, @include_by_default, @created_at, @updated_at, @deleted_at)
     ON CONFLICT(id) DO UPDATE SET
       name = CASE WHEN excluded.updated_at > characters.updated_at THEN excluded.name ELSE characters.name END,
       type = CASE WHEN excluded.updated_at > characters.updated_at THEN excluded.type ELSE characters.type END,
       notes = CASE WHEN excluded.updated_at > characters.updated_at THEN excluded.notes ELSE characters.notes END,
       include_by_default = CASE WHEN excluded.updated_at > characters.updated_at THEN excluded.include_by_default ELSE characters.include_by_default END,
       updated_at = MAX(excluded.updated_at, characters.updated_at),
       deleted_at = CASE WHEN excluded.updated_at > characters.updated_at THEN excluded.deleted_at ELSE characters.deleted_at END`
  );

  const upsertBook = db.prepare(
    `INSERT INTO books (id, title, description, cover_image_path, status, hidden, created_at, updated_at, deleted_at)
     VALUES (@id, @title, @description, @cover_image_path, @status, @hidden, @created_at, @updated_at, @deleted_at)
     ON CONFLICT(id) DO UPDATE SET
       title = CASE WHEN excluded.updated_at > books.updated_at THEN excluded.title ELSE books.title END,
       description = CASE WHEN excluded.updated_at > books.updated_at THEN excluded.description ELSE books.description END,
       status = CASE WHEN excluded.updated_at > books.updated_at THEN excluded.status ELSE books.status END,
       hidden = CASE WHEN excluded.updated_at > books.updated_at THEN excluded.hidden ELSE books.hidden END,
       updated_at = MAX(excluded.updated_at, books.updated_at),
       deleted_at = CASE WHEN excluded.updated_at > books.updated_at THEN excluded.deleted_at ELSE books.deleted_at END`
  );

  const upsertPage = db.prepare(
    `INSERT INTO pages (id, book_id, page_number, text, image_path, image_status, created_at, updated_at, deleted_at)
     VALUES (@id, @book_id, @page_number, @text, @image_path, @image_status, @created_at, @updated_at, @deleted_at)
     ON CONFLICT(id) DO UPDATE SET
       page_number = CASE WHEN excluded.updated_at > pages.updated_at THEN excluded.page_number ELSE pages.page_number END,
       text = CASE WHEN excluded.updated_at > pages.updated_at THEN excluded.text ELSE pages.text END,
       image_status = CASE WHEN excluded.updated_at > pages.updated_at THEN excluded.image_status ELSE pages.image_status END,
       updated_at = MAX(excluded.updated_at, pages.updated_at),
       deleted_at = CASE WHEN excluded.updated_at > pages.updated_at THEN excluded.deleted_at ELSE pages.deleted_at END`
  );

  const pushAll = db.transaction(() => {
    if (Array.isArray(characters)) {
      for (const c of characters as SyncEntity[]) {
        upsertCharacter.run({
          id: c.id,
          name: c.name,
          type: c.type || "family",
          notes: c.notes || "",
          photo_path: c.photo_path || null,
          include_by_default: c.include_by_default || 0,
          created_at: c.created_at || Date.now(),
          updated_at: c.updated_at || Date.now(),
          deleted_at: c.deleted_at || null,
        });
        results.characters++;
      }
    }

    if (Array.isArray(books)) {
      for (const b of books as SyncEntity[]) {
        upsertBook.run({
          id: b.id,
          title: b.title,
          description: b.description || "",
          cover_image_path: b.cover_image_path || null,
          status: b.status || "ready",
          hidden: b.hidden || 0,
          created_at: b.created_at || Date.now(),
          updated_at: b.updated_at || Date.now(),
          deleted_at: b.deleted_at || null,
        });
        results.books++;
      }
    }

    if (Array.isArray(pages)) {
      for (const p of pages as SyncEntity[]) {
        upsertPage.run({
          id: p.id,
          book_id: p.book_id,
          page_number: p.page_number,
          text: p.text,
          image_path: p.image_path || null,
          image_status: p.image_status || "done",
          created_at: p.created_at || Date.now(),
          updated_at: p.updated_at || Date.now(),
          deleted_at: p.deleted_at || null,
        });
        results.pages++;
      }
    }
  });

  pushAll();

  res.json({
    synced: results,
    server_time: Date.now(),
  });
});

export default router;
