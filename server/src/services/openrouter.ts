import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getUploadsDir } from "../db";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
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

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  modalities?: string[];
}

async function scalePhoto(photoPath: string): Promise<Buffer> {
  return sharp(photoPath)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
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
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const body: Record<string, any> = {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature ?? 0.8,
    max_tokens: request.max_tokens ?? 4096,
  };
  if (request.modalities) {
    body.modalities = request.modalities;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
  model?: string
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

export async function generateStory(
  description: string,
  pageCount: number,
  model?: string
): Promise<GenerationResult<StoryResponse>> {
  const useModel = model || DEFAULT_STORY_MODEL;
  const systemPrompt = `You are a children's storybook author. Write a short, engaging story for young children (ages 3-7).

Rules:
- The story must have exactly ${pageCount} pages
- Each page should have 2-3 short sentences (suitable for reading aloud)
- Use simple, vivid language that children enjoy
- The story should have a clear beginning, middle, and end
- Include descriptive scenes that would make good illustrations
- Do NOT describe characters' physical appearances in the text (e.g. don't say "Dana, a 3 year old with curly blonde hair"). The reader already knows the characters — just use their names naturally.

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
  visualDirection?: string
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

  const hadReferenceImage = validPreviousPaths.length > 0;
  if (hadReferenceImage) {
    prompt += `I've attached the ${validPreviousPaths.length} previous page illustration(s) from this book. `;
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

    for (const prevPath of validPreviousPaths) {
      const prevPart = await buildImagePart(prevPath);
      if (prevPart) {
        parts.push(prevPart);
        numImagesAttached++;
      }
    }

    parts.push({ type: "text", text: prompt });

    const response = await makeRequest({
      model: useModel,
      messages: [{ role: "user", content: parts }],
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
  model?: string
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
