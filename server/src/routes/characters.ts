import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import db, { getUploadsDir } from "../db";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(getUploadsDir(), "characters"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// List all characters (non-deleted)
router.get("/", (_req: Request, res: Response) => {
  const characters = db
    .prepare(
      "SELECT * FROM characters WHERE deleted_at IS NULL ORDER BY created_at DESC"
    )
    .all();
  res.json(characters);
});

// Get single character
router.get("/:id", (req: Request, res: Response) => {
  const character = db
    .prepare("SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id);
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json(character);
});

// Create character
router.post("/", (req: Request, res: Response) => {
  const { id, name, type, notes, include_by_default, created_at, updated_at } = req.body;
  const now = Date.now();
  const character = {
    id: id || uuidv4(),
    name,
    type: type || "family",
    notes: notes || "",
    include_by_default: include_by_default ? 1 : 0,
    created_at: created_at || now,
    updated_at: updated_at || now,
  };

  db.prepare(
    `INSERT INTO characters (id, name, type, notes, include_by_default, created_at, updated_at)
     VALUES (@id, @name, @type, @notes, @include_by_default, @created_at, @updated_at)`
  ).run(character);

  res.status(201).json(
    db.prepare("SELECT * FROM characters WHERE id = ?").get(character.id)
  );
});

// Update character
router.put("/:id", (req: Request, res: Response) => {
  const existing = db
    .prepare("SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const { name, type, notes, include_by_default, updated_at } = req.body;
  db.prepare(
    `UPDATE characters SET name = ?, type = ?, notes = ?, include_by_default = ?, updated_at = ? WHERE id = ?`
  ).run(
    name ?? (existing as any).name,
    type ?? (existing as any).type,
    notes ?? (existing as any).notes,
    include_by_default != null ? (include_by_default ? 1 : 0) : (existing as any).include_by_default,
    updated_at || Date.now(),
    req.params.id
  );

  res.json(
    db.prepare("SELECT * FROM characters WHERE id = ?").get(req.params.id)
  );
});

// Soft delete character
router.delete("/:id", (req: Request, res: Response) => {
  const result = db
    .prepare(
      "UPDATE characters SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
    )
    .run(Date.now(), Date.now(), req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.status(204).send();
});

// Upload character photo
router.post(
  "/:id/photo",
  upload.single("photo"),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No photo file provided" });
      return;
    }

    const character = db
      .prepare("SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL")
      .get(req.params.id) as any;
    if (!character) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Character not found" });
      return;
    }

    // Delete old photo if exists
    if (character.photo_path) {
      const oldPath = path.join(getUploadsDir(), character.photo_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `characters/${req.file.filename}`;
    db.prepare(
      "UPDATE characters SET photo_path = ?, updated_at = ? WHERE id = ?"
    ).run(relativePath, Date.now(), req.params.id);

    res.json({ photo_path: relativePath });
  }
);

// Get character photo
router.get("/:id/photo", (req: Request, res: Response) => {
  const character = db
    .prepare("SELECT photo_path FROM characters WHERE id = ?")
    .get(req.params.id) as any;
  if (!character?.photo_path) {
    res.status(404).json({ error: "No photo found" });
    return;
  }

  const filePath = path.join(getUploadsDir(), character.photo_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Photo file missing" });
    return;
  }

  res.sendFile(filePath);
});

export default router;
