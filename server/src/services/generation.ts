import path from "path";
import fs from "fs";
import { pLimit } from "../utils";
import { nanoid } from "../utils";
import db, { getUploadsDir } from "../db";
import {
  generateStory,
  generateIllustration,
  generateCover,
  CharacterRef,
  LocationRef,
  GenerationResult,
} from "./openrouter";

// --- Generation Log Helper ---

function saveGenerationLog(
  result: Omit<GenerationResult<any>, "data">,
  context: {
    jobId: string;
    bookId: string | null;
    pageId: string | null;
    stepType: "story" | "illustration" | "cover";
  }
) {
  const id = nanoid();
  db.prepare(
    `INSERT INTO generation_logs (id, job_id, book_id, page_id, step_type, model, prompt, system_prompt, character_refs_json, num_images_attached, had_reference_image, response_text, response_model, success, error_message, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    context.jobId,
    context.bookId,
    context.pageId,
    context.stepType,
    result.model,
    result.prompt,
    result.systemPrompt,
    result.characterRefsJson,
    result.numImagesAttached,
    result.hadReferenceImage ? 1 : 0,
    result.responseText,
    result.responseModel,
    result.success ? 1 : 0,
    result.errorMessage,
    result.durationMs,
    Date.now()
  );
}

// Concurrency controls
const ILLUSTRATION_CONCURRENCY = 3;
const MAX_CONCURRENT_JOBS = 2;
const WORKER_POLL_INTERVAL_MS = 2000;
const HEARTBEAT_STALE_MS = 10 * 60 * 1000; // 10 minutes

let activeJobCount = 0;
let shuttingDown = false;

// --- DB Helpers ---

interface GenerationJob {
  id: string;
  book_id: string | null;
  status: string;
  progress_message: string | null;
  progress_fraction: number;
  total_steps: number;
  completed_steps: number;
  first_illustration_ready: number;
  completed_page_ids: string | null;
  error_message: string | null;
  request_payload: string;
  started_at: number | null;
  heartbeat_at: number | null;
  created_at: number;
  updated_at: number;
}

function updateJobStatus(
  jobId: string,
  updates: {
    status?: string;
    progress_message?: string;
    progress_fraction?: number;
    completed_steps?: number;
    total_steps?: number;
    first_illustration_ready?: boolean;
    completed_page_ids?: string[];
    error_message?: string;
    book_id?: string;
    started_at?: number;
  }
) {
  const now = Date.now();
  const sets: string[] = ["heartbeat_at = @heartbeat_at", "updated_at = @now"];
  const params: Record<string, any> = { heartbeat_at: now, now, id: jobId };

  if (updates.status !== undefined) {
    sets.push("status = @status");
    params.status = updates.status;
  }
  if (updates.progress_message !== undefined) {
    sets.push("progress_message = @progress_message");
    params.progress_message = updates.progress_message;
  }
  if (updates.progress_fraction !== undefined) {
    sets.push("progress_fraction = @progress_fraction");
    params.progress_fraction = updates.progress_fraction;
  }
  if (updates.completed_steps !== undefined) {
    sets.push("completed_steps = @completed_steps");
    params.completed_steps = updates.completed_steps;
  }
  if (updates.total_steps !== undefined) {
    sets.push("total_steps = @total_steps");
    params.total_steps = updates.total_steps;
  }
  if (updates.first_illustration_ready !== undefined) {
    sets.push("first_illustration_ready = @first_illustration_ready");
    params.first_illustration_ready = updates.first_illustration_ready ? 1 : 0;
  }
  if (updates.completed_page_ids !== undefined) {
    sets.push("completed_page_ids = @completed_page_ids");
    params.completed_page_ids = JSON.stringify(updates.completed_page_ids);
  }
  if (updates.error_message !== undefined) {
    sets.push("error_message = @error_message");
    params.error_message = updates.error_message;
  }
  if (updates.book_id !== undefined) {
    sets.push("book_id = @book_id");
    params.book_id = updates.book_id;
  }
  if (updates.started_at !== undefined) {
    sets.push("started_at = @started_at");
    params.started_at = updates.started_at;
  }

  db.prepare(`UPDATE generation_jobs SET ${sets.join(", ")} WHERE id = @id`).run(
    params
  );
}

function isJobCancelled(jobId: string): boolean {
  const row = db
    .prepare("SELECT status FROM generation_jobs WHERE id = ?")
    .get(jobId) as { status: string } | undefined;
  return row?.status === "cancelled";
}

// --- Character Loading ---

interface DbCharacter {
  id: string;
  name: string;
  type: string;
  notes: string;
  photo_path: string | null;
}

function loadCharacterRefs(characterIds: string[]): CharacterRef[] {
  if (characterIds.length === 0) return [];

  const placeholders = characterIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, name, type, notes, photo_path FROM characters WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    )
    .all(...characterIds) as DbCharacter[];

  return rows.map((c) => {
    const typeLabel = c.type === "family" ? "family member" : "friend";
    let description = typeLabel;
    if (c.notes.trim()) description += `. ${c.notes}`;
    return {
      name: c.name,
      description,
      photoPath: c.photo_path,
    };
  });
}

// --- Location Loading ---

interface DbLocation {
  id: string;
  name: string;
  description: string;
}

interface DbLocationPhoto {
  photo_path: string;
}

function loadLocationRefs(locationIds: string[]): LocationRef[] {
  if (locationIds.length === 0) return [];

  const placeholders = locationIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, name, description FROM locations WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    )
    .all(...locationIds) as DbLocation[];

  return rows.map((loc) => {
    const photos = db
      .prepare(
        "SELECT photo_path FROM location_photos WHERE location_id = ? ORDER BY sort_order"
      )
      .all(loc.id) as DbLocationPhoto[];

    return {
      name: loc.name,
      description: loc.description,
      photoPaths: photos.map((p) => p.photo_path),
    };
  });
}

function enrichDescription(
  description: string,
  characters: CharacterRef[],
  locations: LocationRef[]
): string {
  let enriched = description;
  if (characters.length > 0) {
    enriched += "\n\nCharacters to feature in the story:\n";
    for (const c of characters) {
      enriched += `- ${c.name} (${c.description})\n`;
    }
  }
  if (locations.length > 0) {
    enriched += "\n\nSettings/locations for the story:\n";
    for (const loc of locations) {
      enriched += `- ${loc.name}`;
      if (loc.description) enriched += ` (${loc.description})`;
      enriched += `\n`;
    }
  }
  return enriched;
}

// --- Book Generation ---

async function executeGenerateBook(job: GenerationJob): Promise<void> {
  const payload = JSON.parse(job.request_payload);
  const { description, pageCount, characterIds, locationIds, bookId } = payload;
  // Optional model overrides
  const storyModel: string | undefined = payload.storyModel;
  const illustrationModel: string | undefined = payload.illustrationModel;
  const coverModel: string | undefined = payload.coverModel;
  const uploadsDir = getUploadsDir();
  const illustrationsDir = path.join(uploadsDir, "illustrations");
  const coversDir = path.join(uploadsDir, "covers");
  const now = Date.now();

  // total_steps = 1 (story) + pageCount (illustrations) + 1 (cover)
  const totalSteps = pageCount + 2;

  updateJobStatus(job.id, {
    status: "generating_story",
    progress_message: "Writing story with AI...",
    progress_fraction: 0,
    total_steps: totalSteps,
    completed_steps: 0,
    book_id: bookId,
    started_at: now,
  });

  // Load characters and locations
  const characters = loadCharacterRefs(characterIds || []);
  const locations = loadLocationRefs(locationIds || []);
  const enrichedDescription = enrichDescription(description, characters, locations);

  // Step 1: Generate story text
  const storyResult = await generateStory(enrichedDescription, pageCount, storyModel);
  const story = storyResult.data;

  saveGenerationLog(storyResult, {
    jobId: job.id,
    bookId,
    pageId: null,
    stepType: "story",
  });

  if (isJobCancelled(job.id)) return;

  // Create book + pages in DB
  db.prepare(
    `INSERT INTO books (id, title, description, status, created_at, updated_at)
     VALUES (?, ?, ?, 'generating', ?, ?)`
  ).run(bookId, story.title, description, now, now);

  const pageIds: string[] = [];
  for (const page of story.pages) {
    const pageId = nanoid();
    pageIds.push(pageId);
    db.prepare(
      `INSERT INTO pages (id, book_id, page_number, text, image_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(pageId, bookId, page.pageNumber, page.text, now, now);
  }

  updateJobStatus(job.id, {
    status: "generating_illustrations",
    progress_message: "Story written! Generating illustrations...",
    progress_fraction: 1 / totalSteps,
    completed_steps: 1,
  });

  if (isJobCancelled(job.id)) return;

  // Step 2: Generate page 1 illustration (sequential — style reference)
  const firstPageId = pageIds[0];
  const firstPageText = story.pages[0].text;
  const firstImagePath = path.join(illustrationsDir, `${firstPageId}.png`);

  // Mark page 1 as generating
  db.prepare(
    "UPDATE pages SET image_status = 'generating', updated_at = ? WHERE id = ?"
  ).run(Date.now(), firstPageId);

  updateJobStatus(job.id, {
    progress_message: "Drawing illustration 1 of " + pageCount + "...",
  });

  const firstResult = await generateIllustration(
    firstPageText,
    story.title,
    firstImagePath,
    null,
    characters,
    locations,
    illustrationModel
  );
  const firstSuccess = firstResult.data;

  saveGenerationLog(firstResult, {
    jobId: job.id,
    bookId,
    pageId: firstPageId,
    stepType: "illustration",
  });

  if (firstSuccess) {
    db.prepare(
      "UPDATE pages SET image_path = ?, image_status = 'done', updated_at = ? WHERE id = ?"
    ).run(`illustrations/${firstPageId}.png`, Date.now(), firstPageId);

    updateJobStatus(job.id, {
      completed_steps: 2,
      progress_fraction: 2 / totalSteps,
      first_illustration_ready: true,
      completed_page_ids: [firstPageId],
    });
  } else {
    db.prepare(
      "UPDATE pages SET image_status = 'error', updated_at = ? WHERE id = ?"
    ).run(Date.now(), firstPageId);
    updateJobStatus(job.id, {
      completed_steps: 2,
      progress_fraction: 2 / totalSteps,
    });
  }

  if (isJobCancelled(job.id)) return;

  // Step 3: Generate remaining pages + cover in parallel (with concurrency limit)
  const limit = pLimit(ILLUSTRATION_CONCURRENCY);
  const completedPageIds: string[] = firstSuccess ? [firstPageId] : [];
  let completedSteps = 2;

  const tasks: Promise<void>[] = [];

  // Remaining page illustrations
  for (let i = 1; i < story.pages.length; i++) {
    const pageId = pageIds[i];
    const pageText = story.pages[i].text;
    const imagePath = path.join(illustrationsDir, `${pageId}.png`);

    tasks.push(
      limit(async () => {
        if (isJobCancelled(job.id)) return;

        db.prepare(
          "UPDATE pages SET image_status = 'generating', updated_at = ? WHERE id = ?"
        ).run(Date.now(), pageId);

        const illusResult = await generateIllustration(
          pageText,
          story.title,
          imagePath,
          firstSuccess ? firstImagePath : null,
          characters,
          locations,
          illustrationModel
        );
        const success = illusResult.data;

        saveGenerationLog(illusResult, {
          jobId: job.id,
          bookId,
          pageId,
          stepType: "illustration",
        });

        completedSteps++;
        if (success) {
          db.prepare(
            "UPDATE pages SET image_path = ?, image_status = 'done', updated_at = ? WHERE id = ?"
          ).run(`illustrations/${pageId}.png`, Date.now(), pageId);
          completedPageIds.push(pageId);
        } else {
          db.prepare(
            "UPDATE pages SET image_status = 'error', updated_at = ? WHERE id = ?"
          ).run(Date.now(), pageId);
        }

        updateJobStatus(job.id, {
          progress_message: `Drawing illustration ${completedSteps - 1} of ${pageCount}...`,
          progress_fraction: completedSteps / totalSteps,
          completed_steps: completedSteps,
          completed_page_ids: completedPageIds,
        });
      })
    );
  }

  // Cover generation
  tasks.push(
    limit(async () => {
      if (isJobCancelled(job.id)) return;

      const coverPath = path.join(coversDir, `${bookId}.png`);
      const coverResult = await generateCover(
        story.title,
        firstSuccess ? firstImagePath : "",
        coverPath,
        coverModel
      );
      const success = coverResult.data;

      saveGenerationLog(coverResult, {
        jobId: job.id,
        bookId,
        pageId: null,
        stepType: "cover",
      });

      completedSteps++;
      if (success) {
        db.prepare(
          "UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?"
        ).run(`covers/${bookId}.png`, Date.now(), bookId);
      }

      updateJobStatus(job.id, {
        progress_fraction: completedSteps / totalSteps,
        completed_steps: completedSteps,
      });
    })
  );

  await Promise.all(tasks);

  // Mark book as ready
  db.prepare(
    "UPDATE books SET status = 'ready', updated_at = ? WHERE id = ?"
  ).run(Date.now(), bookId);

  updateJobStatus(job.id, {
    status: "done",
    progress_message: "Done!",
    progress_fraction: 1,
    completed_steps: totalSteps,
    completed_page_ids: completedPageIds,
  });
}

// --- Illustration Regeneration ---

async function executeRegenerateIllustrations(
  job: GenerationJob
): Promise<void> {
  const payload = JSON.parse(job.request_payload);
  const { bookId } = payload;

  interface DbBook {
    id: string;
    title: string;
    description: string;
  }
  interface DbPage {
    id: string;
    page_number: number;
    text: string;
    image_path: string | null;
    image_status: string;
  }

  const book = db
    .prepare("SELECT id, title, description FROM books WHERE id = ?")
    .get(bookId) as DbBook | undefined;
  if (!book) throw new Error(`Book ${bookId} not found`);

  const pages = db
    .prepare(
      "SELECT id, page_number, text, image_path, image_status FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number"
    )
    .all(bookId) as DbPage[];

  const needsRegen = pages.filter(
    (p) => p.image_status === "error" || p.image_status === "pending"
  );
  if (needsRegen.length === 0) {
    updateJobStatus(job.id, {
      status: "done",
      progress_message: "All illustrations already complete",
      progress_fraction: 1,
    });
    return;
  }

  const uploadsDir = getUploadsDir();
  const illustrationsDir = path.join(uploadsDir, "illustrations");
  const totalSteps = needsRegen.length;

  updateJobStatus(job.id, {
    status: "generating_illustrations",
    progress_message: `Regenerating ${needsRegen.length} illustration(s)...`,
    total_steps: totalSteps,
    completed_steps: 0,
    book_id: bookId,
    started_at: Date.now(),
  });

  // Find page 1 image as style reference
  const page1 = pages[0];
  let referenceImagePath: string | null = null;
  if (page1?.image_path) {
    const fullPath = path.join(uploadsDir, page1.image_path);
    if (fs.existsSync(fullPath)) referenceImagePath = fullPath;
  }

  // Load characters from description (no character IDs stored for regen)
  const characters: CharacterRef[] = [];
  const locations: LocationRef[] = [];

  const limit = pLimit(ILLUSTRATION_CONCURRENCY);
  const completedPageIds: string[] = [];
  let completedSteps = 0;

  const tasks = needsRegen.map((page) =>
    limit(async () => {
      if (isJobCancelled(job.id)) return;

      const imagePath = path.join(illustrationsDir, `${page.id}.png`);
      db.prepare(
        "UPDATE pages SET image_status = 'generating', updated_at = ? WHERE id = ?"
      ).run(Date.now(), page.id);

      const illusResult = await generateIllustration(
        page.text,
        book.title,
        imagePath,
        referenceImagePath,
        characters,
        locations
      );
      const success = illusResult.data;

      saveGenerationLog(illusResult, {
        jobId: job.id,
        bookId,
        pageId: page.id,
        stepType: "illustration",
      });

      completedSteps++;
      if (success) {
        db.prepare(
          "UPDATE pages SET image_path = ?, image_status = 'done', updated_at = ? WHERE id = ?"
        ).run(`illustrations/${page.id}.png`, Date.now(), page.id);
        completedPageIds.push(page.id);
      } else {
        db.prepare(
          "UPDATE pages SET image_status = 'error', updated_at = ? WHERE id = ?"
        ).run(Date.now(), page.id);
      }

      updateJobStatus(job.id, {
        progress_message: `Regenerated ${completedSteps} of ${totalSteps} illustrations`,
        progress_fraction: completedSteps / totalSteps,
        completed_steps: completedSteps,
        completed_page_ids: completedPageIds,
      });
    })
  );

  await Promise.all(tasks);

  updateJobStatus(job.id, {
    status: "done",
    progress_message: "Done!",
    progress_fraction: 1,
  });
}

// --- Cover Regeneration ---

async function executeRegenerateCovers(job: GenerationJob): Promise<void> {
  interface DbBook {
    id: string;
    title: string;
  }
  interface DbPage {
    image_path: string | null;
  }

  const books = db
    .prepare(
      "SELECT id, title FROM books WHERE status = 'ready' AND deleted_at IS NULL"
    )
    .all() as DbBook[];

  if (books.length === 0) {
    updateJobStatus(job.id, {
      status: "done",
      progress_message: "No books to regenerate covers for",
      progress_fraction: 1,
    });
    return;
  }

  const uploadsDir = getUploadsDir();
  const coversDir = path.join(uploadsDir, "covers");
  const totalSteps = books.length;

  updateJobStatus(job.id, {
    status: "generating_illustrations",
    progress_message: `Regenerating covers for ${books.length} books...`,
    total_steps: totalSteps,
    completed_steps: 0,
    started_at: Date.now(),
  });

  const limit = pLimit(ILLUSTRATION_CONCURRENCY);
  let completedSteps = 0;

  const tasks = books.map((book) =>
    limit(async () => {
      if (isJobCancelled(job.id)) return;

      const page1 = db
        .prepare(
          "SELECT image_path FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number LIMIT 1"
        )
        .get(book.id) as DbPage | undefined;

      if (!page1?.image_path) {
        completedSteps++;
        return;
      }

      const firstPageImagePath = path.join(uploadsDir, page1.image_path);
      if (!fs.existsSync(firstPageImagePath)) {
        completedSteps++;
        return;
      }

      const coverPath = path.join(coversDir, `${book.id}.png`);
      const coverResult = await generateCover(book.title, firstPageImagePath, coverPath);
      const success = coverResult.data;

      saveGenerationLog(coverResult, {
        jobId: job.id,
        bookId: book.id,
        pageId: null,
        stepType: "cover",
      });

      if (success) {
        db.prepare(
          "UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?"
        ).run(`covers/${book.id}.png`, Date.now(), book.id);
      }

      completedSteps++;
      updateJobStatus(job.id, {
        progress_message: `Regenerated ${completedSteps} of ${totalSteps} covers`,
        progress_fraction: completedSteps / totalSteps,
        completed_steps: completedSteps,
      });
    })
  );

  await Promise.all(tasks);

  updateJobStatus(job.id, {
    status: "done",
    progress_message: "Cover regeneration complete!",
    progress_fraction: 1,
  });
}

// --- Worker Loop ---

async function processJob(job: GenerationJob): Promise<void> {
  const payload = JSON.parse(job.request_payload);
  const jobType = payload.type || "generate_book";

  switch (jobType) {
    case "generate_book":
      await executeGenerateBook(job);
      break;
    case "regenerate_illustrations":
      await executeRegenerateIllustrations(job);
      break;
    case "regenerate_covers":
      await executeRegenerateCovers(job);
      break;
    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
}

async function workerTick(): Promise<void> {
  if (shuttingDown || activeJobCount >= MAX_CONCURRENT_JOBS) return;

  const job = db
    .prepare(
      "SELECT * FROM generation_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    )
    .get() as GenerationJob | undefined;

  if (!job) return;

  activeJobCount++;
  try {
    await processJob(job);
  } catch (e: any) {
    console.error(`Generation job ${job.id} failed:`, e);

    // Save generation log from error metadata if available (e.g. story generation failure)
    if (e.generationMeta) {
      saveGenerationLog(e.generationMeta, {
        jobId: job.id,
        bookId: job.book_id,
        pageId: null,
        stepType: "story",
      });
    }

    updateJobStatus(job.id, {
      status: "error",
      error_message: e.message || "Unknown error",
      progress_message: "Generation failed",
    });

    // Mark book as error if it was created
    if (job.book_id) {
      db.prepare(
        "UPDATE books SET status = 'error', updated_at = ? WHERE id = ?"
      ).run(Date.now(), job.book_id);
    }
  } finally {
    activeJobCount--;
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startWorker(): void {
  console.log("Generation worker started");
  workerInterval = setInterval(() => {
    workerTick().catch((e) => console.error("Worker tick error:", e));
  }, WORKER_POLL_INTERVAL_MS);
}

export function stopWorker(): void {
  shuttingDown = true;
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  console.log("Generation worker stopped");
}

// --- Public Helpers ---

export function getJobStatus(jobId: string): GenerationJob | null {
  const job = db
    .prepare("SELECT * FROM generation_jobs WHERE id = ?")
    .get(jobId) as GenerationJob | undefined;

  if (!job) return null;

  // Stale detection: if in-progress but heartbeat is old, mark as error
  if (
    job.status !== "done" &&
    job.status !== "error" &&
    job.status !== "cancelled" &&
    job.status !== "pending" &&
    job.heartbeat_at &&
    Date.now() - job.heartbeat_at > HEARTBEAT_STALE_MS
  ) {
    updateJobStatus(jobId, {
      status: "error",
      error_message: "Generation timed out (no heartbeat)",
      progress_message: "Generation timed out",
    });
    return db
      .prepare("SELECT * FROM generation_jobs WHERE id = ?")
      .get(jobId) as GenerationJob;
  }

  return job;
}

export function getActiveJobs(): GenerationJob[] {
  return db
    .prepare(
      "SELECT * FROM generation_jobs WHERE status NOT IN ('done', 'error', 'cancelled') ORDER BY created_at DESC"
    )
    .all() as GenerationJob[];
}

export { GenerationJob };
