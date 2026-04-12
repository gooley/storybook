import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getUploadsDir } from "../db";
import { getOpenRouterKey } from "./config";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Default models
export const DEFAULT_STORY_MODEL = "anthropic/claude-sonnet-4.6";
export const DEFAULT_ILLUSTRATION_MODEL = "google/gemini-3.1-flash-image-preview";
export const DEFAULT_COVER_MODEL = "bytedance-seed/seedream-4.5";

export interface CharacterRef {
  name: string;
  description: string;
  photoPath: string | null;
}

export interface LocationRef {
  name: string;
  description: string;
  photoPaths: string[];
}

export interface StoryPage {
  pageNumber: number;
  text: string;
}

export interface StoryResponse {
  title: string;
  pages: StoryPage[];
}

/** Metadata returned from every generation call for debug logging */
export interface GenerationResult<T = void> {
  data: T;
  model: string;
  prompt: string;
  systemPrompt: string | null;
  responseText: string | null;
  responseModel: string | null;
  numImagesAttached: number;
  hadReferenceImage: boolean;
  characterRefsJson: string | null;
  success: boolean;
  errorMessage: string | null;
  durationMs: number;
}

interface ChatMessage {
  role: string;
  content: any;
}

/** Optional metadata sent to OpenRouter for broadcast/observability tracing */
export interface TraceMetadata {
  bookId?: string;
  stepType?: "story" | "continuity" | "illustration" | "cover";
  pageNumber?: number;
  totalPages?: number;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  modalities?: string[];
  trace?: TraceMetadata;
}

async function scalePhoto(photoPath: string): Promise<Buffer> {
  return sharp(photoPath)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** How many of the most recent pages to send individually (downscaled). */
const RECENT_PAGE_COUNT = 2;

/** Max dimension for individually-sent recent pages. */
const RECENT_PAGE_MAX_DIM = 768;

/** Max dimension for each thumbnail in the storyboard composite. */
const STORYBOARD_THUMB_DIM = 384;

/**
 * Downscale an illustration for sending as a recent-page reference.
 * Smaller than full-res but larger than storyboard thumbnails.
 */
async function scaleIllustration(filePath: string): Promise<Buffer> {
  return sharp(filePath)
    .resize(RECENT_PAGE_MAX_DIM, RECENT_PAGE_MAX_DIM, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Compose multiple illustration files into a single storyboard grid image.
 * Each thumbnail is labeled with its page number. Returns a JPEG buffer.
 */
async function buildStoryboardComposite(
  imagePaths: string[]
): Promise<Buffer | null> {
  const existing = imagePaths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) return null;

  // Determine grid layout — prefer wider grids since illustrations are landscape
  const count = existing.length;
  const cols = Math.min(count, Math.ceil(Math.sqrt(count * 1.5)));
  const rows = Math.ceil(count / cols);

  const thumbW = STORYBOARD_THUMB_DIM;
  // Illustrations are landscape, so thumbs should be wider than tall
  const thumbH = Math.round(STORYBOARD_THUMB_DIM * 0.65);
  const padding = 4;
  const labelH = 18;

  const canvasW = cols * (thumbW + padding) + padding;
  const canvasH = rows * (thumbH + padding + labelH) + padding;

  // Build each thumbnail
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < existing.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (thumbW + padding);
    const y = padding + row * (thumbH + padding + labelH);

    // Resize the illustration to thumbnail dimensions
    const thumb = await sharp(existing[i])
      .resize(thumbW, thumbH, { fit: "cover" })
      .toBuffer();

    composites.push({ input: thumb, left: x, top: y + labelH });

    // Create a small label like "Page 1"
    const labelSvg = Buffer.from(
      `<svg width="${thumbW}" height="${labelH}">
        <text x="2" y="13" font-family="sans-serif" font-size="12" fill="#333">Page ${i + 1}</text>
      </svg>`
    );
    composites.push({ input: labelSvg, left: x, top: y });
  }

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

function fileToBase64Part(
  data: Buffer,
  mimeType: string
): Record<string, any> {
  const b64 = data.toString("base64");
  return {
    type: "image_url",
    image_url: { url: `data:${mimeType};base64,${b64}` },
  };
}

async function buildImagePart(
  filePath: string
): Promise<Record<string, any> | null> {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const data = await fs.promises.readFile(filePath);
  return fileToBase64Part(data, mimeType);
}

async function makeRequest(request: ChatRequest): Promise<any> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured. Complete setup at the app's web interface.");
  }

  const body: Record<string, any> = {
    model: request.model,
    messages: request.messages,
    max_tokens: request.max_tokens ?? 4096,
  };
  // Some models (e.g. openai/gpt-5-image-mini) don't support temperature
  if (request.temperature != null) {
    body.temperature = request.temperature;
  }
  if (request.modalities) {
    body.modalities = request.modalities;
  }

  // OpenRouter broadcast metadata
  if (request.trace?.bookId) {
    body.session_id = request.trace.bookId;
    body.trace = {
      trace_id: request.trace.bookId,
      trace_name: "Storybook Generation",
      generation_name: request.trace.stepType || "unknown",
      ...(request.trace.pageNumber != null && { page_number: request.trace.pageNumber }),
      ...(request.trace.totalPages != null && { total_pages: request.trace.totalPages }),
    };
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter API error ${response.status}: ${responseBody}`);
  }

  return JSON.parse(responseBody);
}

function extractResponseModel(responseJson: any): string | null {
  return responseJson?.model || null;
}

function extractImageData(responseJson: any): Buffer | null {
  try {
    const choices = responseJson.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;

    const message = choices[0].message;
    if (!message) return null;

    // Path 1: message.images array (OpenRouter image model format)
    if (Array.isArray(message.images) && message.images.length > 0) {
      const imageObj = message.images[0];
      const url = imageObj?.image_url?.url;
      if (typeof url === "string" && url.includes("base64,")) {
        const b64 = url.split("base64,")[1];
        return Buffer.from(b64, "base64");
      }
    }

    // Path 2: Fallback — regex scan of content for base64 data URI
    const content = message.content;
    if (content) {
      const contentStr =
        typeof content === "string" ? content : JSON.stringify(content);
      const match = contentStr.match(
        /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/
      );
      if (match) {
        return Buffer.from(match[1], "base64");
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseStoryResponse(content: string): StoryResponse {
  let jsonStr = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  const objStart = jsonStr.indexOf("{");
  const objEnd = jsonStr.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    jsonStr = jsonStr.substring(objStart, objEnd + 1);
  }

  return JSON.parse(jsonStr) as StoryResponse;
}

// --- Public API ---

/**
 * Generates a per-page visual continuity plan by analyzing all page texts together.
 * Returns an array of visual direction strings, one per page, describing what
 * should be visually consistent/different on each page.
 */
export async function generateVisualContinuityPlan(
  story: StoryResponse,
  characters: CharacterRef[],
  locations: LocationRef[],
  model?: string,
  trace?: TraceMetadata
): Promise<GenerationResult<string[]>> {
  const useModel = model || DEFAULT_STORY_MODEL;
  const startTime = Date.now();

  let characterContext = "";
  if (characters.length > 0) {
    characterContext = "\n\nCharacters:\n";
    for (const c of characters) {
      characterContext += `- ${c.name}: ${c.description}\n`;
    }
  }

  let locationContext = "";
  if (locations.length > 0) {
    locationContext += "\n\nLocations:\n";
    for (const loc of locations) {
      locationContext += `- ${loc.name}`;
      if (loc.description) locationContext += `: ${loc.description}`;
      locationContext += `\n`;
    }
  }

  const allPagesText = story.pages
    .map((p) => `Page ${p.pageNumber}: ${p.text}`)
    .join("\n");

  const systemPrompt = `You are an art director for a children's storybook illustration team. Your job is to ensure visual consistency across all pages by writing precise visual directions for each page's illustration.

For EACH page, describe:
- Character poses, expressions, and actions (what exactly are they doing?)
- Clothing/costumes/accessories (what is each character wearing? track changes explicitly)
- Setting details (where are they? what's in the background? time of day? lighting?)
- Key props and objects (what items are present? where are they positioned?)
- Any visual changes from the previous page (what specifically changed and what stayed the same?)

CRITICAL RULES:
- If a character puts on a costume/outfit on page 1, they must STILL be wearing it on subsequent pages unless the story explicitly says they changed.
- If a character falls asleep, they stay asleep until the story says they wake up (and vice versa).
- Track the physical state of every character and prop across pages. Be explicit about what persists.
- Note the setting/background for each page — if the scene hasn't changed, the background should match.

Format your response as a JSON array of strings, one per page. Each string should be a concise visual direction paragraph (3-5 sentences).
Return ONLY the JSON array, no other text.`;

  const userPrompt = `Here is the full story for "${story.title}":
${characterContext}${locationContext}

${allPagesText}

Write visual directions for each of the ${story.pages.length} pages to ensure illustration consistency.`;

  try {
    const response = await makeRequest({
      model: useModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      trace,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");

    // Parse the JSON array from the response
    let jsonStr = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const arrStart = jsonStr.indexOf("[");
    const arrEnd = jsonStr.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      jsonStr = jsonStr.substring(arrStart, arrEnd + 1);
    }

    const directions = JSON.parse(jsonStr) as string[];

    return {
      data: directions,
      model: useModel,
      prompt: userPrompt,
      systemPrompt,
      responseText: content,
      responseModel: extractResponseModel(response),
      numImagesAttached: 0,
      hadReferenceImage: false,
      characterRefsJson: null,
      success: true,
      errorMessage: null,
      durationMs: Date.now() - startTime,
    };
  } catch (e: any) {
    console.error("Visual continuity plan generation error:", e);
    // Return empty array on failure — illustrations can still proceed without it
    return {
      data: [],
      model: useModel,
      prompt: userPrompt,
      systemPrompt,
      responseText: null,
      responseModel: null,
      numImagesAttached: 0,
      hadReferenceImage: false,
      characterRefsJson: null,
      success: false,
      errorMessage: e.message || "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}

// Narrative styles randomly assigned to each story for variety
const NARRATIVE_STYLES = [
  {
    label: "whimsical",
    instruction: "Write in a whimsical, playful tone with surprising turns and silly moments. Use bouncy, rhythmic language.",
  },
  {
    label: "adventurous",
    instruction: "Write an exciting adventure story with a sense of wonder and discovery. Use action verbs and build suspense between pages.",
  },
  {
    label: "cozy",
    instruction: "Write a warm, gentle story with a cozy atmosphere. Focus on comfort, togetherness, and small meaningful moments.",
  },
  {
    label: "curious",
    instruction: "Write a story driven by curiosity and questions. Let the main character explore, investigate, and figure things out.",
  },
  {
    label: "lyrical",
    instruction: "Write in a poetic, lyrical style with vivid sensory details — sounds, textures, smells, colors. Make the language itself beautiful.",
  },
  {
    label: "humorous",
    instruction: "Write a genuinely funny story with unexpected twists, wordplay, or absurd situations that will make kids laugh out loud.",
  },
  {
    label: "mysterious",
    instruction: "Write a story with a gentle mystery or puzzle to solve. Build intrigue and let clues unfold page by page.",
  },
  {
    label: "empathetic",
    instruction: "Write a story centered on feelings and relationships. Show characters navigating emotions like frustration, pride, nervousness, or joy in relatable ways.",
  },
];

function pickNarrativeStyle(): (typeof NARRATIVE_STYLES)[number] {
  return NARRATIVE_STYLES[Math.floor(Math.random() * NARRATIVE_STYLES.length)];
}

export async function generateStory(
  description: string,
  pageCount: number,
  model?: string,
  trace?: TraceMetadata
): Promise<GenerationResult<StoryResponse>> {
  const useModel = model || DEFAULT_STORY_MODEL;
  const style = pickNarrativeStyle();

  const systemPrompt = `You are a talented children's storybook author with a distinctive voice. Write a short, engaging story for young children (ages 3-7).

Narrative style for this story: ${style.instruction}

Rules:
- The story must have exactly ${pageCount} pages
- Each page should have 2-3 short sentences (suitable for reading aloud)
- Use simple, vivid language that children enjoy
- The story should have a clear beginning, middle, and end
- Include descriptive scenes that would make good illustrations
- Do NOT describe characters' physical appearances in the text (e.g. don't say "Dana, a 3 year old with curly blonde hair"). The reader already knows the characters — just use their names naturally.

Variety and freshness:
- Avoid overused children's book clichés. In particular, do NOT use "giggled", "tummy", or "magical" — find fresher alternatives.
- Vary how you express emotions — instead of always saying a character laughed or giggled, try: gasped, whispered, clapped, bounced, squealed, beamed, grinned, cheered, hummed, or showed emotion through actions.
- Each story should feel distinct. Vary sentence structure, pacing, and vocabulary from story to story.
- Prefer specific, concrete details over generic descriptions (e.g. "the puddle reflected the clouds" instead of "it was a beautiful day").
- Give characters distinct reactions — not everyone responds the same way to every situation.

Format your response as a JSON object with a "title" field and a "pages" array.
Example: {"title": "The Brave Little Fox", "pages": [{"pageNumber": 1, "text": "Once upon a time..."}, {"pageNumber": 2, "text": "The next thing..."}]}

Return ONLY the JSON object, no other text.`;

  const userPrompt = `Write a children's story based on this idea: ${description}`;
  const startTime = Date.now();

  try {
    const response = await makeRequest({
      model: useModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 1.0,
      trace,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");

    const story = parseStoryResponse(content);

    return {
      data: story,
      model: useModel,
      prompt: userPrompt,
      systemPrompt,
      responseText: content,
      responseModel: extractResponseModel(response),
      numImagesAttached: 0,
      hadReferenceImage: false,
      characterRefsJson: null,
      success: true,
      errorMessage: null,
      durationMs: Date.now() - startTime,
    };
  } catch (e: any) {
    throw Object.assign(e, {
      generationMeta: {
        model: useModel,
        prompt: userPrompt,
        systemPrompt,
        responseText: null,
        responseModel: null,
        numImagesAttached: 0,
        hadReferenceImage: false,
        characterRefsJson: null,
        success: false,
        errorMessage: e.message || "Unknown error",
        durationMs: Date.now() - startTime,
      },
    });
  }
}

export async function generateIllustration(
  pageText: string,
  bookTitle: string,
  outputPath: string,
  previousImagePaths: string[],
  characters: CharacterRef[],
  locations: LocationRef[],
  model?: string,
  visualDirection?: string,
  elementPhotoPaths?: string[],
  trace?: TraceMetadata
): Promise<GenerationResult<boolean>> {
  const useModel = model || DEFAULT_ILLUSTRATION_MODEL;
  const uploadsDir = getUploadsDir();
  const startTime = Date.now();
  let numImagesAttached = 0;

  // Filter to only paths that exist on disk
  const validPreviousPaths = previousImagePaths.filter((p) =>
    fs.existsSync(p)
  );

  // Build prompt
  let prompt = `Generate an illustration for a children's storybook page.\n\n`;
  prompt += `Book title: "${bookTitle}"\n`;
  prompt += `Page text: "${pageText}"\n\n`;

  if (characters.length > 0) {
    prompt += `Characters in this story (reference photos attached where available):\n`;
    characters.forEach((c, i) => {
      prompt += `- ${c.name}: ${c.description}`;
      if (c.photoPath && fs.existsSync(path.join(uploadsDir, c.photoPath))) {
        prompt += ` [see reference photo ${i + 1}]`;
      }
      prompt += `\n`;
    });
    prompt += `\nDraw these characters to resemble their reference photos — `;
    prompt += `capture their key features, coloring, and proportions in the illustration style.\n\n`;
  }

  // Count character photos for reference numbering offset
  let refPhotoCount = characters.filter(
    (c) => c.photoPath && fs.existsSync(path.join(uploadsDir, c.photoPath))
  ).length;

  if (locations.length > 0) {
    prompt += `Settings/locations in this story (reference photos attached where available):\n`;
    locations.forEach((loc) => {
      prompt += `- ${loc.name}`;
      if (loc.description) prompt += `: ${loc.description}`;
      const existingPhotos = loc.photoPaths.filter((p) =>
        fs.existsSync(path.join(uploadsDir, p))
      );
      if (existingPhotos.length > 0) {
        const refs = existingPhotos.map(() => {
          refPhotoCount++;
          return `reference photo ${refPhotoCount}`;
        });
        prompt += ` [see ${refs.join(", ")}]`;
      }
      prompt += `\n`;
    });
    prompt += `\nUse these location reference photos to capture the look and feel of the setting in the illustration.\n\n`;
  }

  // Element reference photos
  const elementPathsArray = Array.isArray(elementPhotoPaths) ? elementPhotoPaths : [];
  const validElementPaths = elementPathsArray
    .filter((p: string) => typeof p === "string" && !p.includes(".."))
    .filter((p: string) => fs.existsSync(path.join(uploadsDir, p)));
  if (validElementPaths.length > 0) {
    prompt += `Element reference photos (items/details to include in the illustration):\n`;
    const refs = validElementPaths.map(() => {
      refPhotoCount++;
      return `reference photo ${refPhotoCount}`;
    });
    prompt += `See ${refs.join(", ")} — incorporate these elements into the illustration.\n\n`;
  }

  const hadReferenceImage = validPreviousPaths.length > 0;
  if (hadReferenceImage) {
    const recentCount = Math.min(validPreviousPaths.length, RECENT_PAGE_COUNT);
    const olderCount = validPreviousPaths.length - recentCount;
    if (olderCount > 0) {
      prompt += `I've attached a storyboard grid of pages 1–${olderCount} from this book, plus the ${recentCount} most recent page(s) as individual images. `;
    } else {
      prompt += `I've attached the ${recentCount} previous page illustration(s) from this book. `;
    }
    prompt += `Study them carefully and keep a consistent art style, color palette, and character designs throughout.\n\n`;
  }

  if (visualDirection) {
    prompt += `VISUAL DIRECTION FOR THIS PAGE (from the art director — follow carefully):\n`;
    prompt += `${visualDirection}\n\n`;
  }

  prompt += `Style: Sharp pen and ink illustration with bold lines. `;
  prompt += `Use a limited palette of 6 highly saturated colors suitable for a color e-ink display. `;
  prompt += `The illustration should be simple, clear, and appealing to young children.\n\n`;
  prompt += `IMPORTANT: The image must be horizontal/landscape orientation.\n\n`;
  prompt += `IMPORTANT: Do NOT include any text, words, letters, numbers, captions, titles, labels, or writing of any kind in the image. The image must contain only visual artwork with zero text.`;

  const characterRefsJson =
    characters.length > 0
      ? JSON.stringify(
          characters.map((c) => ({ name: c.name, description: c.description }))
        )
      : null;

  try {
    // Build multimodal content: character photos first, then previous pages, then text
    const parts: Record<string, any>[] = [];

    for (const c of characters) {
      if (c.photoPath) {
        const fullPath = path.join(uploadsDir, c.photoPath);
        if (fs.existsSync(fullPath)) {
          const scaled = await scalePhoto(fullPath);
          parts.push(fileToBase64Part(scaled, "image/jpeg"));
          numImagesAttached++;
        }
      }
    }

    for (const loc of locations) {
      for (const photoPath of loc.photoPaths) {
        const fullPath = path.join(uploadsDir, photoPath);
        if (fs.existsSync(fullPath)) {
          const scaled = await scalePhoto(fullPath);
          parts.push(fileToBase64Part(scaled, "image/jpeg"));
          numImagesAttached++;
        }
      }
    }

    for (const elemPath of validElementPaths) {
      const fullPath = path.join(uploadsDir, elemPath);
      if (fs.existsSync(fullPath)) {
        const scaled = await scalePhoto(fullPath);
        parts.push(fileToBase64Part(scaled, "image/jpeg"));
        numImagesAttached++;
      }
    }

    // Attach previous page illustrations using hybrid composite strategy:
    // - Older pages → composited into a single storyboard grid thumbnail
    // - Most recent N pages → sent individually (downscaled) for fine detail
    if (validPreviousPaths.length > 0) {
      const recentCount = Math.min(validPreviousPaths.length, RECENT_PAGE_COUNT);
      const olderPaths = validPreviousPaths.slice(0, -recentCount);
      const recentPaths = validPreviousPaths.slice(-recentCount);

      // Storyboard composite of older pages (if any)
      if (olderPaths.length > 0) {
        const composite = await buildStoryboardComposite(olderPaths);
        if (composite) {
          parts.push(fileToBase64Part(composite, "image/jpeg"));
          numImagesAttached++;
        }
      }

      // Recent pages sent individually at reduced resolution
      for (const recentPath of recentPaths) {
        if (fs.existsSync(recentPath)) {
          const scaled = await scaleIllustration(recentPath);
          parts.push(fileToBase64Part(scaled, "image/jpeg"));
          numImagesAttached++;
        }
      }
    }

    parts.push({ type: "text", text: prompt });

    const response = await makeRequest({
      model: useModel,
      messages: [{ role: "user", content: parts }],
      trace,
    });

    const imageBuffer = extractImageData(response);
    if (imageBuffer) {
      await fs.promises.writeFile(outputPath, imageBuffer);
      console.log(`Saved illustration to ${outputPath}`);
      return {
        data: true,
        model: useModel,
        prompt,
        systemPrompt: null,
        responseText: null,
        responseModel: extractResponseModel(response),
        numImagesAttached,
        hadReferenceImage,
        characterRefsJson,
        success: true,
        errorMessage: null,
        durationMs: Date.now() - startTime,
      };
    }

    console.warn("No image data in illustration response");
    return {
      data: false,
      model: useModel,
      prompt,
      systemPrompt: null,
      responseText: null,
      responseModel: extractResponseModel(response),
      numImagesAttached,
      hadReferenceImage,
      characterRefsJson,
      success: false,
      errorMessage: "No image data in response",
      durationMs: Date.now() - startTime,
    };
  } catch (e: any) {
    console.error("Illustration generation error:", e);
    return {
      data: false,
      model: useModel,
      prompt,
      systemPrompt: null,
      responseText: null,
      responseModel: null,
      numImagesAttached,
      hadReferenceImage,
      characterRefsJson,
      success: false,
      errorMessage: e.message || "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}

export async function generateCover(
  title: string,
  firstPageImagePath: string,
  outputPath: string,
  model?: string,
  trace?: TraceMetadata
): Promise<GenerationResult<boolean>> {
  const useModel = model || DEFAULT_COVER_MODEL;
  const startTime = Date.now();
  const prompt =
    `Use this image as the basis for generating a book cover ` +
    `with the title "${title}". You have artistic license to be ` +
    `creative with typography but keep the same basic content concepts. ` +
    `Ratio should be 3:2 portrait orientation.`;

  let numImagesAttached = 0;
  const hadReferenceImage = fs.existsSync(firstPageImagePath);

  try {
    const parts: Record<string, any>[] = [];
    parts.push({ type: "text", text: prompt });

    if (hadReferenceImage) {
      const imagePart = await buildImagePart(firstPageImagePath);
      if (imagePart) {
        parts.push(imagePart);
        numImagesAttached++;
      }
    }

    const response = await makeRequest({
      model: useModel,
      messages: [{ role: "user", content: parts }],
      modalities: ["image"],
      trace,
    });

    const imageBuffer = extractImageData(response);
    if (imageBuffer) {
      await fs.promises.writeFile(outputPath, imageBuffer);
      console.log(`Saved cover to ${outputPath}`);
      return {
        data: true,
        model: useModel,
        prompt,
        systemPrompt: null,
        responseText: null,
        responseModel: extractResponseModel(response),
        numImagesAttached,
        hadReferenceImage,
        characterRefsJson: null,
        success: true,
        errorMessage: null,
        durationMs: Date.now() - startTime,
      };
    }

    console.warn("No image data in cover response");
    return {
      data: false,
      model: useModel,
      prompt,
      systemPrompt: null,
      responseText: null,
      responseModel: extractResponseModel(response),
      numImagesAttached,
      hadReferenceImage,
      characterRefsJson: null,
      success: false,
      errorMessage: "No image data in response",
      durationMs: Date.now() - startTime,
    };
  } catch (e: any) {
    console.error("Cover generation error:", e);
    return {
      data: false,
      model: useModel,
      prompt,
      systemPrompt: null,
      responseText: null,
      responseModel: null,
      numImagesAttached,
      hadReferenceImage,
      characterRefsJson: null,
      success: false,
      errorMessage: e.message || "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}
