import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import db, { getUploadsDir } from "../db";

const router = Router();

const MAX_PHOTOS = 3;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(getUploadsDir(), "locations"));
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

// List all locations (non-deleted) with their photos
router.get("/", (_req: Request, res: Response) => {
  const locations = db
    .prepare(
      "SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY created_at DESC"
    )
    .all();
  const photos = db
    .prepare(
      "SELECT * FROM location_photos WHERE location_id IN (SELECT id FROM locations WHERE deleted_at IS NULL) ORDER BY sort_order"
    )
    .all() as any[];

  const photosByLocation = new Map<string, any[]>();
  for (const p of photos) {
    if (!photosByLocation.has(p.location_id)) {
      photosByLocation.set(p.location_id, []);
    }
    photosByLocation.get(p.location_id)!.push(p);
  }

  const result = (locations as any[]).map((loc) => ({
    ...loc,
    photos: photosByLocation.get(loc.id) || [],
  }));

  res.json(result);
});

// Get single location with photos
router.get("/:id", (req: Request, res: Response) => {
  const location = db
    .prepare("SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id) as any;
  if (!location) {
    res.status(404).json({ error: "Location not found" });
    return;
  }

  const photos = db
    .prepare(
      "SELECT * FROM location_photos WHERE location_id = ? ORDER BY sort_order"
    )
    .all(req.params.id);

  res.json({ ...location, photos });
});

// Create location
router.post("/", (req: Request, res: Response) => {
  const { id, name, description, created_at, updated_at } = req.body;
  const now = Date.now();
  const location = {
    id: id || uuidv4(),
    name,
    description: description || "",
    created_at: created_at || now,
    updated_at: updated_at || now,
  };

  db.prepare(
    `INSERT INTO locations (id, name, description, created_at, updated_at)
     VALUES (@id, @name, @description, @created_at, @updated_at)`
  ).run(location);

  const created = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(location.id) as Record<string, unknown>;
  res.status(201).json({ ...created, photos: [] });
});

// Update location
router.put("/:id", (req: Request, res: Response) => {
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL")
    .get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: "Location not found" });
    return;
  }

  const { name, description, updated_at } = req.body;
  db.prepare(
    `UPDATE locations SET name = ?, description = ?, updated_at = ? WHERE id = ?`
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    updated_at || Date.now(),
    req.params.id
  );

  const updated = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(req.params.id) as Record<string, unknown>;
  const photos = db
    .prepare(
      "SELECT * FROM location_photos WHERE location_id = ? ORDER BY sort_order"
    )
    .all(req.params.id);

  res.json({ ...updated, photos });
});

// Soft delete location
router.delete("/:id", (req: Request, res: Response) => {
  const result = db
    .prepare(
      "UPDATE locations SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
    )
    .run(Date.now(), Date.now(), req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.status(204).send();
});

// Upload a photo for a location (up to MAX_PHOTOS)
router.post(
  "/:id/photos",
  upload.single("photo"),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No photo file provided" });
      return;
    }

    const location = db
      .prepare("SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL")
      .get(req.params.id) as any;
    if (!location) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Location not found" });
      return;
    }

    // Check photo count limit
    const existing = db
      .prepare(
        "SELECT COUNT(*) as count FROM location_photos WHERE location_id = ?"
      )
      .get(req.params.id) as any;
    if (existing.count >= MAX_PHOTOS) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({
        error: `Maximum ${MAX_PHOTOS} photos per location`,
      });
      return;
    }

    const photoId = uuidv4();
    const relativePath = `locations/${req.file.filename}`;
    const sortOrder = existing.count;

    db.prepare(
      `INSERT INTO location_photos (id, location_id, photo_path, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(photoId, req.params.id, relativePath, sortOrder, Date.now());

    // Update location's updated_at
    db.prepare("UPDATE locations SET updated_at = ? WHERE id = ?").run(
      Date.now(),
      req.params.id
    );

    res.json({ id: photoId, photo_path: relativePath, sort_order: sortOrder });
  }
);

// Delete a specific photo
router.delete("/:id/photos/:photoId", (req: Request, res: Response) => {
  const photo = db
    .prepare(
      "SELECT * FROM location_photos WHERE id = ? AND location_id = ?"
    )
    .get(req.params.photoId, req.params.id) as any;
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  // Delete the file
  const filePath = path.join(getUploadsDir(), photo.photo_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Delete the record
  db.prepare("DELETE FROM location_photos WHERE id = ?").run(
    req.params.photoId
  );

  // Update location's updated_at
  db.prepare("UPDATE locations SET updated_at = ? WHERE id = ?").run(
    Date.now(),
    req.params.id
  );

  res.status(204).send();
});

// Get a specific photo file
router.get("/:id/photos/:photoId", (req: Request, res: Response) => {
  const photo = db
    .prepare(
      "SELECT photo_path FROM location_photos WHERE id = ? AND location_id = ?"
    )
    .get(req.params.photoId, req.params.id) as any;
  if (!photo?.photo_path) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  const filePath = path.join(getUploadsDir(), photo.photo_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Photo file missing" });
    return;
  }

  res.sendFile(filePath);
});

export default router;
