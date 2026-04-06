import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getUploadsDir } from "../db";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Models
const STORY_MODEL = "anthropic/claude-sonnet-4.6";
const ILLUSTRATION_MODEL = "google/gemini-3.1-flash-image-preview";
const COVER_MODEL = "bytedance-seed/seedream-4.5";

export interface CharacterRef {
  name: string;
  description: string;
  photoPath: string | null;
}

export interface StoryPage {
  pageNumber: number;
  text: string;
}

export interface StoryResponse {
  title: string;
  pages: StoryPage[];
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

export async function generateStory(
  description: string,
  pageCount: number
): Promise<StoryResponse> {
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

  const response = await makeRequest({
    model: STORY_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Write a children's story based on this idea: ${description}`,
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");

  return parseStoryResponse(content);
}

export async function generateIllustration(
  pageText: string,
  bookTitle: string,
  outputPath: string,
  previousImagePath: string | null,
  characters: CharacterRef[]
): Promise<boolean> {
  try {
    const uploadsDir = getUploadsDir();

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

    if (previousImagePath && fs.existsSync(previousImagePath)) {
      prompt += `I've attached the previous page's illustration. `;
      prompt += `Keep a consistent art style, color palette, and character designs.\n\n`;
    }

    prompt += `Style: Sharp pen and ink illustration with bold lines. `;
    prompt += `Use a limited palette of 6 highly saturated colors suitable for a color e-ink display. `;
    prompt += `The illustration should be simple, clear, and appealing to young children.\n\n`;
    prompt += `IMPORTANT: The image must be horizontal/landscape orientation.\n\n`;
    prompt += `IMPORTANT: Do NOT include any text, words, letters, numbers, captions, titles, labels, or writing of any kind in the image. The image must contain only visual artwork with zero text.`;

    // Build multimodal content: character photos first, then previous page, then text
    const parts: Record<string, any>[] = [];

    for (const c of characters) {
      if (c.photoPath) {
        const fullPath = path.join(uploadsDir, c.photoPath);
        if (fs.existsSync(fullPath)) {
          const scaled = await scalePhoto(fullPath);
          parts.push(fileToBase64Part(scaled, "image/jpeg"));
        }
      }
    }

    if (previousImagePath && fs.existsSync(previousImagePath)) {
      const prevPart = await buildImagePart(previousImagePath);
      if (prevPart) parts.push(prevPart);
    }

    parts.push({ type: "text", text: prompt });

    const response = await makeRequest({
      model: ILLUSTRATION_MODEL,
      messages: [{ role: "user", content: parts }],
    });

    const imageBuffer = extractImageData(response);
    if (imageBuffer) {
      await fs.promises.writeFile(outputPath, imageBuffer);
      console.log(`Saved illustration to ${outputPath}`);
      return true;
    }

    console.warn("No image data in illustration response");
    return false;
  } catch (e) {
    console.error("Illustration generation error:", e);
    return false;
  }
}

export async function generateCover(
  title: string,
  firstPageImagePath: string,
  outputPath: string
): Promise<boolean> {
  try {
    const prompt =
      `Use this image as the basis for generating a book cover ` +
      `with the title "${title}". You have artistic license to be ` +
      `creative with typography but keep the same basic content concepts. ` +
      `Ratio should be 3:2 portrait orientation.`;

    const parts: Record<string, any>[] = [];
    parts.push({ type: "text", text: prompt });

    if (fs.existsSync(firstPageImagePath)) {
      const imagePart = await buildImagePart(firstPageImagePath);
      if (imagePart) parts.push(imagePart);
    }

    const response = await makeRequest({
      model: COVER_MODEL,
      messages: [{ role: "user", content: parts }],
      modalities: ["image"],
    });

    const imageBuffer = extractImageData(response);
    if (imageBuffer) {
      await fs.promises.writeFile(outputPath, imageBuffer);
      console.log(`Saved cover to ${outputPath}`);
      return true;
    }

    console.warn("No image data in cover response");
    return false;
  } catch (e) {
    console.error("Cover generation error:", e);
    return false;
  }
}
