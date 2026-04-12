import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import db, { getUploadsDir } from "../db";

const router = Router();

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(getUploadsDir(), "covers"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const illustrationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(getUploadsDir(), "illustrations"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// List all books (non-deleted)
router.get("/", (_req: Request, res: Response) => {
  const books = db
    .prepare(
      `SELECT b.*,
        EXISTS(
          SELECT 1 FROM page_audio pa
          JOIN pages p ON pa.page_id = p.id
          WHERE p.book_id = b.id AND pa.status = 'done'
        ) as has_audio
       FROM books b WHERE b.deleted_at IS NULL ORDER BY b.created_at DESC`
    )
    .all();
  res.json(books);
});

// Get single book with page count
router.get("/:id", (req: Request, res: Response) => {
  const book = db
    .prepare("SELECT * FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id) as any;
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const pageCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM pages WHERE book_id = ? AND deleted_at IS NULL"
    )
    .get(req.params.id) as any;
  res.json({ ...book, page_count: pageCount.count });
});

// Create book
router.post("/", (req: Request, res: Response) => {
  const { id, title, description, status, created_at, updated_at } = req.body;
  const now = Date.now();
  const book = {
    id: id || uuidv4(),
    title,
    description: description || "",
    status: status || "ready",
    created_at: created_at || now,
    updated_at: updated_at || now,
  };

  db.prepare(
    `INSERT INTO books (id, title, description, status, created_at, updated_at)
     VALUES (@id, @title, @description, @status, @created_at, @updated_at)`
  ).run(book);

  res.status(201).json(
    db.prepare("SELECT * FROM books WHERE id = ?").get(book.id)
  );
});

// Update book
router.put("/:id", (req: Request, res: Response) => {
  const existing = db
    .prepare("SELECT * FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const { title, description, status, hidden, updated_at } = req.body;
  db.prepare(
    `UPDATE books SET title = ?, description = ?, status = ?, hidden = ?, updated_at = ? WHERE id = ?`
  ).run(
    title ?? existing.title,
    description ?? existing.description,
    status ?? existing.status,
    hidden ?? existing.hidden,
    updated_at || Date.now(),
    req.params.id
  );

  res.json(
    db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id)
  );
});

// Soft delete book
router.delete("/:id", (req: Request, res: Response) => {
  const now = Date.now();
  const result = db
    .prepare(
      "UPDATE books SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
    )
    .run(now, now, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  // Also soft-delete pages
  db.prepare(
    "UPDATE pages SET deleted_at = ?, updated_at = ? WHERE book_id = ? AND deleted_at IS NULL"
  ).run(now, now, req.params.id);

  res.status(204).send();
});

// Upload cover image
router.post(
  "/:id/cover",
  coverUpload.single("cover"),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No cover file provided" });
      return;
    }

    const book = db
      .prepare("SELECT * FROM books WHERE id = ? AND deleted_at IS NULL")
      .get(req.params.id) as any;
    if (!book) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Book not found" });
      return;
    }

    if (book.cover_image_path) {
      const oldPath = path.join(getUploadsDir(), book.cover_image_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `covers/${req.file.filename}`;
    db.prepare(
      "UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?"
    ).run(relativePath, Date.now(), req.params.id);

    res.json({ cover_image_path: relativePath });
  }
);

// Get cover image
router.get("/:id/cover", (req: Request, res: Response) => {
  const book = db
    .prepare("SELECT cover_image_path FROM books WHERE id = ?")
    .get(req.params.id) as any;
  if (!book?.cover_image_path) {
    res.status(404).json({ error: "No cover found" });
    return;
  }

  const filePath = path.join(getUploadsDir(), book.cover_image_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Cover file missing" });
    return;
  }

  res.sendFile(filePath);
});

// Get original generation params for a book (for "create variation" flow)
router.get("/:id/generation-params", (req: Request, res: Response) => {
  const book = db
    .prepare("SELECT id, title, description FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id) as any;
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  // Find the most recent generate_book job for this book
  const job = db
    .prepare(
      "SELECT request_payload FROM generation_jobs WHERE book_id = ? AND request_payload LIKE '%generate_book%' ORDER BY created_at DESC LIMIT 1"
    )
    .get(req.params.id) as { request_payload: string } | undefined;

  if (!job) {
    // No job found — return what we know from the book itself
    const pageCount = db
      .prepare("SELECT COUNT(*) as count FROM pages WHERE book_id = ? AND deleted_at IS NULL")
      .get(req.params.id) as any;
    res.json({
      description: book.description || "",
      pageCount: pageCount.count || 4,
      characterIds: [],
      locationIds: [],
      title: book.title,
    });
    return;
  }

  const payload = JSON.parse(job.request_payload);
  res.json({
    description: payload.description || book.description || "",
    pageCount: payload.pageCount || 4,
    characterIds: payload.characterIds || [],
    locationIds: payload.locationIds || [],
    title: book.title,
    storyModel: payload.storyModel || null,
    illustrationModel: payload.illustrationModel || null,
    coverModel: payload.coverModel || null,
  });
});

// Get generation logs for a book
router.get("/:id/generation-logs", (req: Request, res: Response) => {
  const book = db
    .prepare("SELECT id FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id);
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const logs = db
    .prepare(
      "SELECT * FROM generation_logs WHERE book_id = ? ORDER BY created_at ASC"
    )
    .all(req.params.id);
  res.json(logs);
});

// Get pages for a book
router.get("/:id/pages", (req: Request, res: Response) => {
  const pages = db
    .prepare(
      "SELECT * FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number"
    )
    .all(req.params.id);
  res.json(pages);
});

// Create/update pages (batch)
router.post("/:id/pages", (req: Request, res: Response) => {
  const book = db
    .prepare("SELECT * FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id);
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const pages: any[] = req.body.pages || req.body;
  if (!Array.isArray(pages)) {
    res.status(400).json({ error: "Expected array of pages" });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO pages (id, book_id, page_number, text, image_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       page_number = excluded.page_number,
       text = excluded.text,
       image_status = excluded.image_status,
       updated_at = excluded.updated_at`
  );

  const now = Date.now();
  const insertMany = db.transaction((items: any[]) => {
    for (const p of items) {
      upsert.run(
        p.id || uuidv4(),
        req.params.id,
        p.page_number,
        p.text,
        p.image_status || "done",
        p.created_at || now,
        p.updated_at || now
      );
    }
  });

  insertMany(pages);

  const result = db
    .prepare(
      "SELECT * FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number"
    )
    .all(req.params.id);
  res.json(result);
});

// Upload page illustration
router.post(
  "/pages/:pageId/image",
  illustrationUpload.single("image"),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const page = db
      .prepare("SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL")
      .get(req.params.pageId) as any;
    if (!page) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Page not found" });
      return;
    }

    if (page.image_path) {
      const oldPath = path.join(getUploadsDir(), page.image_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `illustrations/${req.file.filename}`;
    db.prepare(
      "UPDATE pages SET image_path = ?, image_status = 'done', updated_at = ? WHERE id = ?"
    ).run(relativePath, Date.now(), req.params.pageId);

    res.json({ image_path: relativePath });
  }
);

// Get page illustration
router.get("/pages/:pageId/image", (req: Request, res: Response) => {
  const page = db
    .prepare("SELECT image_path FROM pages WHERE id = ?")
    .get(req.params.pageId) as any;
  if (!page?.image_path) {
    res.status(404).json({ error: "No illustration found" });
    return;
  }

  const filePath = path.join(getUploadsDir(), page.image_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Illustration file missing" });
    return;
  }

  res.sendFile(filePath);
});

// Get audio entries for a page
router.get("/pages/:pageId/audio", (req: Request, res: Response) => {
  const audioEntries = db
    .prepare(
      "SELECT * FROM page_audio WHERE page_id = ? AND status = 'done' ORDER BY audio_type DESC, sort_order ASC"
    )
    .all(req.params.pageId);
  res.json(audioEntries);
});

// Stream audio file
router.get("/audio/:audioId", (req: Request, res: Response) => {
  const audio = db
    .prepare("SELECT audio_path FROM page_audio WHERE id = ?")
    .get(req.params.audioId) as any;
  if (!audio?.audio_path) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }

  const filePath = path.join(getUploadsDir(), audio.audio_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Audio file missing" });
    return;
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.sendFile(filePath);
});

export default router;
