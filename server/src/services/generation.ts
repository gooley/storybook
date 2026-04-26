import path from "path";
import fs from "fs";
import { pLimit } from "../utils";
import { nanoid } from "../utils";
import db, { getUploadsDir } from "../db";
import {
  generateStory,
  generateIllustration,
  generateCover,
  generateContinuityAndSoundDesign,
  CharacterRef,
  LocationRef,
  GenerationResult,
  TraceMetadata,
  PageDesign,
} from "./openrouter";
import { generateSoundEffect, hasElevenLabsKey } from "./elevenlabs";

// --- Generation Log Helper ---

function saveGenerationLog(
  result: Omit<GenerationResult<any>, "data">,
  context: {
    jobId: string;
    bookId: string | null;
    pageId: string | null;
    stepType: "story" | "illustration" | "cover" | "sound_design" | "audio";
  }
) {
  const id = nanoid();
  db.prepare(
    `INSERT INTO generation_logs (id, job_id, book_id, page_id, step_type, model, prompt, system_prompt, character_refs_json, num_images_attached, had_reference_image, response_text, response_model, success, error_message, duration_ms, input_image_paths_json, output_image_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    result.inputImagePaths && result.inputImagePaths.length > 0
      ? JSON.stringify(result.inputImagePaths)
      : null,
    result.outputImagePath ?? null,
    Date.now()
  );
}

type AudioType = "ambient" | "sfx";

interface AudioPageEntry {
  id: string;
  pageId: string;
  audioType: AudioType;
  description: string;
  durationHint: number;
  sortOrder: number;
  generationKey: string;
}

interface AudioClipJob {
  generationKey: string;
  primaryAudioId: string;
  primaryPageId: string;
  audioType: AudioType;
  description: string;
  durationHint: number;
  rowIds: string[];
}

const MAX_AMBIENT_TRACKS_PER_STORY = 2;
const MAX_SFX_PER_STORY = 2;
const AMBIENT_DURATION_SECONDS = 30;
const MIN_SFX_DURATION_SECONDS = 4;
const MAX_SFX_DURATION_SECONDS = 12;

function normalizeAudioPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampSfxDuration(value: number): number {
  if (!Number.isFinite(value)) return 6;
  return Math.max(MIN_SFX_DURATION_SECONDS, Math.min(MAX_SFX_DURATION_SECONDS, value));
}

function buildCappedAudioPlan(
  pageIds: string[],
  pageDesigns: PageDesign[]
): { pageEntries: AudioPageEntry[]; clipJobs: AudioClipJob[] } {
  const pageEntries: AudioPageEntry[] = [];
  const clipJobs = new Map<string, AudioClipJob>();
  const ambientTracks = new Map<
    string,
    { description: string; generationKey: string }
  >();
  const ambientTrackKeys: string[] = [];
  let sfxCount = 0;

  const addEntry = (entry: AudioPageEntry) => {
    pageEntries.push(entry);
    const existing = clipJobs.get(entry.generationKey);
    if (existing) {
      existing.rowIds.push(entry.id);
      return;
    }
    clipJobs.set(entry.generationKey, {
      generationKey: entry.generationKey,
      primaryAudioId: entry.id,
      primaryPageId: entry.pageId,
      audioType: entry.audioType,
      description: entry.description,
      durationHint: entry.durationHint,
      rowIds: [entry.id],
    });
  };

  for (let i = 0; i < pageIds.length; i++) {
    const design = pageDesigns[i];
    if (!design) continue;

    const pageId = pageIds[i];
    const ambientDescription = design.ambient.trim();
    if (ambientDescription) {
      const normalized = normalizeAudioPrompt(ambientDescription);
      let ambientTrack = ambientTracks.get(normalized);
      if (!ambientTrack && ambientTrackKeys.length < MAX_AMBIENT_TRACKS_PER_STORY) {
        ambientTrack = {
          description: ambientDescription,
          generationKey: `ambient:${ambientTrackKeys.length + 1}`,
        };
        ambientTracks.set(normalized, ambientTrack);
        ambientTrackKeys.push(normalized);
      } else if (!ambientTrack) {
        const fallbackKey = ambientTrackKeys[ambientTrackKeys.length - 1];
        ambientTrack = fallbackKey ? ambientTracks.get(fallbackKey) : undefined;
      }

      if (ambientTrack) {
        addEntry({
          id: nanoid(),
          pageId,
          audioType: "ambient",
          description: ambientTrack.description,
          durationHint: AMBIENT_DURATION_SECONDS,
          sortOrder: 0,
          generationKey: ambientTrack.generationKey,
        });
      }
    }

    if (sfxCount >= MAX_SFX_PER_STORY || !Array.isArray(design.sfx)) {
      continue;
    }

    for (let s = 0; s < design.sfx.length && sfxCount < MAX_SFX_PER_STORY; s++) {
      const sfx = design.sfx[s];
      const description = sfx.description.trim();
      if (!description) continue;
      const id = nanoid();
      addEntry({
        id,
        pageId,
        audioType: "sfx",
        description,
        durationHint: clampSfxDuration(sfx.durationHint),
        sortOrder: s + 1,
        generationKey: `sfx:${id}`,
      });
      sfxCount++;
    }
  }

  return { pageEntries, clipJobs: Array.from(clipJobs.values()) };
}

function insertAudioRows(pageEntries: AudioPageEntry[]) {
  const insertAudio = db.prepare(
    `INSERT INTO page_audio (id, page_id, audio_type, description, sort_order, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  );
  const audioNow = Date.now();
  for (const entry of pageEntries) {
    insertAudio.run(
      entry.id,
      entry.pageId,
      entry.audioType,
      entry.description,
      entry.sortOrder,
      audioNow,
      audioNow
    );
  }
}

async function generateAudioClipJobs(
  job: GenerationJob,
  bookId: string,
  audioDir: string,
  clipJobs: AudioClipJob[]
) {
  const updateGenerating = db.prepare(
    "UPDATE page_audio SET status = 'generating', updated_at = ? WHERE id = ?"
  );
  const updateDone = db.prepare(
    "UPDATE page_audio SET audio_path = ?, duration_seconds = ?, status = 'done', updated_at = ? WHERE id = ?"
  );
  const updateError = db.prepare(
    "UPDATE page_audio SET status = 'error', updated_at = ? WHERE id = ?"
  );
  const audioLimit = pLimit(4);
  const audioPromises = clipJobs.map((clipJob) =>
    audioLimit(async () => {
      if (isJobCancelled(job.id)) return;

      const startedAt = Date.now();
      for (const rowId of clipJob.rowIds) {
        updateGenerating.run(startedAt, rowId);
      }

      const outputPath = path.join(audioDir, `${clipJob.primaryAudioId}.mp3`);
      const isAmbient = clipJob.audioType === "ambient";
      const audioStart = Date.now();
      const result = await generateSoundEffect(clipJob.description, outputPath, {
        looping: isAmbient,
        durationSeconds: isAmbient ? AMBIENT_DURATION_SECONDS : clipJob.durationHint,
        promptInfluence: isAmbient ? 0.5 : 0.7,
      });
      const audioDuration = Date.now() - audioStart;

      saveGenerationLog(
        {
          model: "elevenlabs-sound-generation",
          prompt: clipJob.description,
          systemPrompt: null,
          characterRefsJson: null,
          numImagesAttached: 0,
          hadReferenceImage: false,
          responseText: result.success
            ? `Generated ${clipJob.audioType} audio (${result.durationSeconds?.toFixed(1)}s)\naudio_id:${clipJob.primaryAudioId}`
            : null,
          responseModel: "elevenlabs-sound-generation",
          inputImagePaths: [],
          outputImagePath: null,
          success: result.success,
          errorMessage: result.error ?? null,
          durationMs: audioDuration,
        },
        {
          jobId: job.id,
          bookId,
          pageId: clipJob.primaryPageId,
          stepType: "audio",
        }
      );

      if (result.success) {
        const sharedAudioPath = `audio/${clipJob.primaryAudioId}.mp3`;
        const finishedAt = Date.now();
        for (const rowId of clipJob.rowIds) {
          updateDone.run(sharedAudioPath, result.durationSeconds, finishedAt, rowId);
        }
      } else {
        console.error(`Audio generation failed for ${clipJob.primaryAudioId}: ${result.error}`);
        const failedAt = Date.now();
        for (const rowId of clipJob.rowIds) {
          updateError.run(failedAt, rowId);
        }
      }
    })
  );

  await Promise.all(audioPromises);
}

async function generateCappedAudioForDesigns(
  job: GenerationJob,
  bookId: string,
  audioDir: string,
  pageIds: string[],
  pageDesigns: PageDesign[]
) {
  const { pageEntries, clipJobs } = buildCappedAudioPlan(pageIds, pageDesigns);
  insertAudioRows(pageEntries);
  await generateAudioClipJobs(job, bookId, audioDir, clipJobs);
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
  locations: LocationRef[],
  theme?: string,
  customTheme?: string
): string {
  let enriched = description;
  if (theme && theme !== "none") {
    const themeLabels: Record<string, string> = {
      "making-a-friend": "Making a new friend",
      "learning-something-new": "Learning to do something new",
      "first-day-of-school": "First day of school",
      "being-independent": "Learning to be independent",
      "overcoming-fear": "Overcoming a fear",
      "helping-others": "Helping others",
      "sharing-and-kindness": "Sharing and kindness",
      "big-adventure": "Going on a big adventure",
      "believing-in-yourself": "Believing in yourself",
      "trying-after-failing": "Trying again after failing",
    };
    const themeText = theme === "custom" ? customTheme : themeLabels[theme];
    if (themeText) {
      enriched += `\n\nStory theme: ${themeText}`;
    }
  }
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
  const { description, pageCount, characterIds, locationIds, elementPhotoPaths, bookId } = payload;
  // Optional model overrides
  const storyModel: string | undefined = payload.storyModel;
  const illustrationModel: string | undefined = payload.illustrationModel;
  const coverModel: string | undefined = payload.coverModel;
  const theme: string | undefined = payload.theme;
  const customTheme: string | undefined = payload.customTheme;
  const illustrationStyle: string | undefined = payload.illustrationStyle;
  const uploadsDir = getUploadsDir();
  const illustrationsDir = path.join(uploadsDir, "illustrations");
  const coversDir = path.join(uploadsDir, "covers");
  const audioDir = path.join(uploadsDir, "audio");
  const now = Date.now();
  const audioEnabled = hasElevenLabsKey() && payload.generateAudio !== false;

  // total_steps = 1 (story) + pageCount (illustrations) + 1 (cover) + 1 (audio, if enabled)
  const totalSteps = pageCount + 2 + (audioEnabled ? 1 : 0);

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
  const enrichedDescription = enrichDescription(description, characters, locations, theme, customTheme);

  // Step 1: Generate story text (with reference images for context)
  const storyResult = await generateStory(
    enrichedDescription,
    pageCount,
    characters,
    locations,
    elementPhotoPaths || [],
    storyModel,
    {
      bookId,
      stepType: "story",
      totalPages: pageCount,
    }
  );
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

  // Step 1b: Generate visual continuity plan + sound design (combined)
  updateJobStatus(job.id, {
    progress_message: "Planning visual continuity and sound design...",
  });

  const designResult = await generateContinuityAndSoundDesign(
    story,
    characters,
    locations,
    storyModel,
    {
      bookId,
      stepType: "continuity",
      totalPages: pageCount,
    }
  );
  const pageDesigns = designResult.data;

  saveGenerationLog(designResult, {
    jobId: job.id,
    bookId,
    pageId: null,
    stepType: "sound_design",
  });

  if (isJobCancelled(job.id)) return;

  // Step 2: Generate illustrations serially — each receives all previous images for consistency
  const completedImagePaths: string[] = [];
  const completedPageIds: string[] = [];
  let completedSteps = 1;

  // Extract visual directions from combined design result
  const visualDirections = pageDesigns.map((d) => d.visualDirection);

  for (let i = 0; i < story.pages.length; i++) {
    if (isJobCancelled(job.id)) return;

    const pageId = pageIds[i];
    const pageText = story.pages[i].text;
    const imagePath = path.join(illustrationsDir, `${pageId}.png`);

    db.prepare(
      "UPDATE pages SET image_status = 'generating', updated_at = ? WHERE id = ?"
    ).run(Date.now(), pageId);

    updateJobStatus(job.id, {
      progress_message: `Drawing illustration ${i + 1} of ${pageCount}...`,
    });

    const illusResult = await generateIllustration(
      pageText,
      story.title,
      imagePath,
      completedImagePaths,
      characters,
      locations,
      illustrationModel,
      visualDirections[i] || undefined,
      elementPhotoPaths || [],
      illustrationStyle,
      {
        bookId,
        stepType: "illustration",
        pageNumber: i + 1,
        totalPages: pageCount,
      }
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
      completedImagePaths.push(imagePath);
    } else {
      db.prepare(
        "UPDATE pages SET image_status = 'error', updated_at = ? WHERE id = ?"
      ).run(Date.now(), pageId);
    }

    updateJobStatus(job.id, {
      progress_fraction: completedSteps / totalSteps,
      completed_steps: completedSteps,
      completed_page_ids: completedPageIds,
      ...(i === 0 && success ? { first_illustration_ready: true } : {}),
    });
  }

  if (isJobCancelled(job.id)) return;

  // Step 3: Generate cover using first page image
  const firstImagePath = completedImagePaths.length > 0 ? completedImagePaths[0] : "";
  const coverPath = path.join(coversDir, `${bookId}.png`);
  const coverResult = await generateCover(
    story.title,
    firstImagePath,
    coverPath,
    coverModel,
    illustrationStyle,
    {
      bookId,
      stepType: "cover",
      totalPages: pageCount,
    }
  );
  const coverSuccess = coverResult.data;

  saveGenerationLog(coverResult, {
    jobId: job.id,
    bookId,
    pageId: null,
    stepType: "cover",
  });

  completedSteps++;
  if (coverSuccess) {
    db.prepare(
      "UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?"
    ).run(`covers/${bookId}.png`, Date.now(), bookId);
  }

  updateJobStatus(job.id, {
    progress_fraction: completedSteps / totalSteps,
    completed_steps: completedSteps,
  });

  // Step 4: Generate audio (if ElevenLabs is configured)
  if (audioEnabled && pageDesigns.length > 0) {
    if (isJobCancelled(job.id)) return;

    updateJobStatus(job.id, {
      status: "generating_audio",
      progress_message: "Generating capped story audio...",
    });

    await generateCappedAudioForDesigns(job, bookId, audioDir, pageIds, pageDesigns);

    completedSteps++;
    updateJobStatus(job.id, {
      progress_fraction: completedSteps / totalSteps,
      completed_steps: completedSteps,
    });
  }

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

  // Collect existing illustration paths (in page order) as style references
  const existingImagePaths: string[] = [];
  for (const p of pages) {
    if (p.image_path && p.image_status === "done") {
      const fullPath = path.join(uploadsDir, p.image_path);
      if (fs.existsSync(fullPath)) existingImagePaths.push(fullPath);
    }
  }

  // Load characters from description (no character IDs stored for regen)
  const characters: CharacterRef[] = [];
  const locations: LocationRef[] = [];

  const completedPageIds: string[] = [];
  let completedSteps = 0;

  for (const page of needsRegen) {
    if (isJobCancelled(job.id)) return;

    const imagePath = path.join(illustrationsDir, `${page.id}.png`);
    db.prepare(
      "UPDATE pages SET image_status = 'generating', updated_at = ? WHERE id = ?"
    ).run(Date.now(), page.id);

    const illusResult = await generateIllustration(
      page.text,
      book.title,
      imagePath,
      existingImagePaths,
      characters,
      locations,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        bookId,
        stepType: "illustration",
        pageNumber: page.page_number,
        totalPages: pages.length,
      }
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
      existingImagePaths.push(imagePath);
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
  }

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
      const coverResult = await generateCover(
        book.title,
        firstPageImagePath,
        coverPath,
        undefined,
        undefined,
        {
          bookId: book.id,
          stepType: "cover",
        }
      );
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

async function executeGenerateAudio(job: GenerationJob): Promise<void> {
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
  }

  const book = db
    .prepare("SELECT id, title, description FROM books WHERE id = ?")
    .get(bookId) as DbBook | undefined;
  if (!book) throw new Error(`Book ${bookId} not found`);

  if (!hasElevenLabsKey()) {
    updateJobStatus(job.id, {
      status: "done",
      progress_message: "Skipped — ELEVENLABS_API_KEY not configured",
      progress_fraction: 1,
    });
    return;
  }

  // Delete existing audio to regenerate fresh
  const existingAudio = db
    .prepare(
      "SELECT id, audio_path FROM page_audio WHERE page_id IN (SELECT id FROM pages WHERE book_id = ? AND deleted_at IS NULL)"
    )
    .all(bookId) as Array<{ id: string; audio_path: string | null }>;
  if (existingAudio.length > 0) {
    const uploadsDir = getUploadsDir();
    for (const ea of existingAudio) {
      if (ea.audio_path) {
        const filePath = path.join(uploadsDir, ea.audio_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    db.prepare(
      "DELETE FROM page_audio WHERE page_id IN (SELECT id FROM pages WHERE book_id = ? AND deleted_at IS NULL)"
    ).run(bookId);
  }

  const pages = db
    .prepare(
      "SELECT id, page_number, text FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number"
    )
    .all(bookId) as DbPage[];

  if (pages.length === 0) {
    updateJobStatus(job.id, {
      status: "done",
      progress_message: "No pages found",
      progress_fraction: 1,
    });
    return;
  }

  // Step 1: Sound design via LLM
  updateJobStatus(job.id, {
    status: "generating_sound_design",
    progress_message: "Designing soundscape...",
    total_steps: 2,
    completed_steps: 0,
    book_id: bookId,
    started_at: Date.now(),
  });

  const story = {
    title: book.title,
    pages: pages.map((p) => ({ pageNumber: p.page_number, text: p.text })),
  };

  const designResult = await generateContinuityAndSoundDesign(
    story,
    [],
    [],
    undefined,
    { bookId, stepType: "sound_design", pageNumber: 0, totalPages: pages.length }
  );

  saveGenerationLog(designResult, {
    jobId: job.id,
    bookId,
    pageId: null,
    stepType: "sound_design",
  });

  const pageDesigns = designResult.data || [];
  if (pageDesigns.length === 0) {
    updateJobStatus(job.id, {
      status: "done",
      progress_message: "Sound design produced no results",
      progress_fraction: 1,
    });
    return;
  }

  updateJobStatus(job.id, {
    completed_steps: 1,
    progress_fraction: 0.3,
  });

  // Step 2: Generate audio clips
  if (isJobCancelled(job.id)) return;

  updateJobStatus(job.id, {
    status: "generating_audio",
    progress_message: "Generating capped story audio...",
  });

  const uploadsDir = getUploadsDir();
  const audioDir = path.join(uploadsDir, "audio");

  await generateCappedAudioForDesigns(
    job,
    bookId,
    audioDir,
    pages.map((page) => page.id),
    pageDesigns
  );

  db.prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(
    Date.now(),
    bookId
  );

  updateJobStatus(job.id, {
    status: "done",
    progress_message: "Audio generation complete!",
    progress_fraction: 1,
    completed_steps: 2,
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
    case "generate_audio":
      await executeGenerateAudio(job);
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
