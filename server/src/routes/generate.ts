import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { nanoid } from "../utils";
import db, { getUploadsDir } from "../db";
import {
  getJobStatus,
  getActiveJobs,
  GenerationJob,
} from "../services/generation";

const router = Router();

const MAX_ELEMENT_PHOTOS = 5;

const elementUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(getUploadsDir(), "elements"));
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

// Rate limit config
const MAX_ACTIVE_JOBS = 1;
const MAX_JOBS_PER_HOUR = 5;
const MAX_PENDING_JOBS = 3;

function checkRateLimits(): string | null {
  const activeCount = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM generation_jobs WHERE status NOT IN ('done', 'error', 'cancelled')"
    )
    .get() as { cnt: number };
  if (activeCount.cnt >= MAX_PENDING_JOBS) {
    return `Too many queued jobs (${activeCount.cnt}). Please wait for current jobs to complete.`;
  }

  const activeRunning = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM generation_jobs WHERE status NOT IN ('done', 'error', 'cancelled', 'pending')"
    )
    .get() as { cnt: number };
  if (activeRunning.cnt >= MAX_ACTIVE_JOBS) {
    // Allow queueing but inform
  }

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recentCount = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM generation_jobs WHERE created_at > ?"
    )
    .get(hourAgo) as { cnt: number };
  if (recentCount.cnt >= MAX_JOBS_PER_HOUR) {
    return `Rate limit exceeded (${MAX_JOBS_PER_HOUR} jobs per hour). Please try again later.`;
  }

  return null;
}

// POST /api/generate/element-photos — Upload element reference photos
router.post(
  "/element-photos",
  elementUpload.array("photos", MAX_ELEMENT_PHOTOS),
  (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No photo files provided" });
      return;
    }

    const photos = files.map((f) => ({
      path: `elements/${f.filename}`,
    }));

    res.json({ photos });
  }
);

// POST /api/generate/book — Start a new book generation job
router.post("/book", (req: Request, res: Response) => {
  const { description, pageCount, characterIds, locationIds, elementPhotoPaths, bookId, storyModel, illustrationModel, coverModel } = req.body;

  // Validation
  if (!description || typeof description !== "string") {
    res.status(400).json({ error: "description is required" });
    return;
  }
  const count = parseInt(pageCount) || 4;
  if (![2, 4, 8].includes(count)) {
    res.status(400).json({ error: "pageCount must be 2, 4, or 8" });
    return;
  }
  if (characterIds && !Array.isArray(characterIds)) {
    res.status(400).json({ error: "characterIds must be an array" });
    return;
  }
  if (locationIds && !Array.isArray(locationIds)) {
    res.status(400).json({ error: "locationIds must be an array" });
    return;
  }

  // Validate and sanitize element photo paths
  const ELEMENT_PATH_RE = /^elements\/[a-f0-9-]+\.\w+$/;
  let sanitizedElementPaths: string[] = [];
  if (elementPhotoPaths) {
    if (!Array.isArray(elementPhotoPaths)) {
      res.status(400).json({ error: "elementPhotoPaths must be an array" });
      return;
    }
    if (elementPhotoPaths.length > MAX_ELEMENT_PHOTOS) {
      res.status(400).json({ error: `elementPhotoPaths must have at most ${MAX_ELEMENT_PHOTOS} entries` });
      return;
    }
    const invalid = elementPhotoPaths.filter((p: any) => typeof p !== "string" || !ELEMENT_PATH_RE.test(p));
    if (invalid.length > 0) {
      res.status(400).json({ error: "Invalid element photo paths" });
      return;
    }
    sanitizedElementPaths = elementPhotoPaths;
  }

  // Generate book ID (client-provided or server-generated)
  const resolvedBookId = bookId || nanoid();

  // Idempotency: check if a job already exists for this bookId
  const existing = db
    .prepare(
      "SELECT id, status FROM generation_jobs WHERE book_id = ? AND status NOT IN ('error', 'cancelled')"
    )
    .get(resolvedBookId) as { id: string; status: string } | undefined;
  if (existing) {
    res.status(200).json({ jobId: existing.id, bookId: resolvedBookId });
    return;
  }

  // Validate characters exist
  if (characterIds && characterIds.length > 0) {
    const placeholders = characterIds.map(() => "?").join(",");
    const found = db
      .prepare(
        `SELECT id FROM characters WHERE id IN (${placeholders}) AND deleted_at IS NULL`
      )
      .all(...characterIds) as { id: string }[];
    const foundIds = new Set(found.map((r) => r.id));
    const missing = characterIds.filter(
      (id: string) => !foundIds.has(id)
    );
    if (missing.length > 0) {
      res.status(422).json({
        error: "Some characters not found on server",
        missingCharacterIds: missing,
      });
      return;
    }
  }

  // Validate locations exist
  if (locationIds && locationIds.length > 0) {
    const placeholders = locationIds.map(() => "?").join(",");
    const found = db
      .prepare(
        `SELECT id FROM locations WHERE id IN (${placeholders}) AND deleted_at IS NULL`
      )
      .all(...locationIds) as { id: string }[];
    const foundIds = new Set(found.map((r) => r.id));
    const missing = locationIds.filter(
      (id: string) => !foundIds.has(id)
    );
    if (missing.length > 0) {
      res.status(422).json({
        error: "Some locations not found on server",
        missingLocationIds: missing,
      });
      return;
    }
  }

  // Rate limit check
  const rateLimitError = checkRateLimits();
  if (rateLimitError) {
    res.status(429).json({ error: rateLimitError });
    return;
  }

  // Create job
  const jobId = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_jobs (id, book_id, status, request_payload, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?)`
  ).run(
    jobId,
    resolvedBookId,
    JSON.stringify({
      type: "generate_book",
      description: description.slice(0, 2000),
      pageCount: count,
      characterIds: characterIds || [],
      locationIds: locationIds || [],
      elementPhotoPaths: sanitizedElementPaths,
      bookId: resolvedBookId,
      ...(storyModel && { storyModel }),
      ...(illustrationModel && { illustrationModel }),
      ...(coverModel && { coverModel }),
    }),
    now,
    now
  );

  res.status(202).json({ jobId, bookId: resolvedBookId });
});

// GET /api/generate/active — List all active (non-terminal) jobs
router.get("/active", (_req: Request, res: Response) => {
  const jobs = getActiveJobs();
  res.json(
    jobs.map((j) => formatJobStatus(j))
  );
});

// GET /api/generate/:jobId/status — Poll job progress
router.get("/:jobId/status", (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = getJobStatus(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(formatJobStatus(job));
});

// POST /api/generate/:jobId/cancel — Cancel an in-progress job
router.post("/:jobId/cancel", (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = db
    .prepare("SELECT * FROM generation_jobs WHERE id = ?")
    .get(jobId) as GenerationJob | undefined;

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
    res.status(400).json({ error: `Job already in terminal state: ${job.status}` });
    return;
  }

  db.prepare(
    "UPDATE generation_jobs SET status = 'cancelled', updated_at = ? WHERE id = ?"
  ).run(Date.now(), jobId);

  res.json({ status: "cancelled" });
});

// POST /api/generate/:bookId/regenerate-illustrations — Regenerate failed/pending illustrations
router.post("/:bookId/regenerate-illustrations", (req: Request, res: Response) => {
  const bookId = req.params.bookId as string;

  const book = db
    .prepare("SELECT id FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(bookId) as { id: string } | undefined;
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const rateLimitError = checkRateLimits();
  if (rateLimitError) {
    res.status(429).json({ error: rateLimitError });
    return;
  }

  const jobId = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_jobs (id, book_id, status, request_payload, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?)`
  ).run(
    jobId,
    bookId,
    JSON.stringify({ type: "regenerate_illustrations", bookId }),
    now,
    now
  );

  res.status(202).json({ jobId, bookId });
});

// POST /api/generate/:bookId/generate-audio — Generate sound effects for an existing book
router.post("/:bookId/generate-audio", (req: Request, res: Response) => {
  const bookId = req.params.bookId as string;

  const book = db
    .prepare("SELECT id FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(bookId) as { id: string } | undefined;
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const rateLimitError = checkRateLimits();
  if (rateLimitError) {
    res.status(429).json({ error: rateLimitError });
    return;
  }

  const jobId = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_jobs (id, book_id, status, request_payload, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?)`
  ).run(
    jobId,
    bookId,
    JSON.stringify({ type: "generate_audio", bookId }),
    now,
    now
  );

  res.status(202).json({ jobId, bookId });
});

// POST /api/generate/regenerate-covers — Batch regenerate all covers
router.post("/regenerate-covers", (_req: Request, res: Response) => {
  const rateLimitError = checkRateLimits();
  if (rateLimitError) {
    res.status(429).json({ error: rateLimitError });
    return;
  }

  const jobId = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_jobs (id, status, request_payload, created_at, updated_at)
     VALUES (?, 'pending', ?, ?, ?)`
  ).run(jobId, JSON.stringify({ type: "regenerate_covers" }), now, now);

  res.status(202).json({ jobId });
});

// GET /api/generate/:jobId/logs — Get generation logs for a specific job
router.get("/:jobId/logs", (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = db
    .prepare("SELECT id FROM generation_jobs WHERE id = ?")
    .get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const logs = db
    .prepare(
      "SELECT * FROM generation_logs WHERE job_id = ? ORDER BY created_at ASC"
    )
    .all(jobId);
  res.json(logs);
});

function formatJobStatus(job: GenerationJob) {
  return {
    id: job.id,
    status: job.status,
    bookId: job.book_id,
    progressMessage: job.progress_message,
    progressFraction: job.progress_fraction,
    completedSteps: job.completed_steps,
    totalSteps: job.total_steps,
    firstIllustrationReady: !!job.first_illustration_ready,
    completedPageIds: job.completed_page_ids
      ? JSON.parse(job.completed_page_ids)
      : [],
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export default router;
