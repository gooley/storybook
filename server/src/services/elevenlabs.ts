import fs from "fs";
import path from "path";
import {
  getElevenLabsKey,
  hasElevenLabsKey,
} from "./config";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/sound-generation";

export { getElevenLabsKey, hasElevenLabsKey };

export interface SoundEffectOptions {
  looping?: boolean;
  durationSeconds?: number;
  promptInfluence?: number;
}

export interface SoundEffectResult {
  success: boolean;
  durationSeconds?: number;
  error?: string;
}

/**
 * Generate a sound effect using ElevenLabs text-to-sound-effects API.
 * Saves the resulting MP3 to outputPath.
 */
export async function generateSoundEffect(
  prompt: string,
  outputPath: string,
  options: SoundEffectOptions = {}
): Promise<SoundEffectResult> {
  const apiKey = getElevenLabsKey();
  if (!apiKey) {
    return { success: false, error: "ELEVENLABS_API_KEY not configured" };
  }

  const {
    looping = false,
    durationSeconds,
    promptInfluence = 0.3,
  } = options;

  const body: Record<string, any> = {
    text: prompt,
    looping,
    prompt_influence: promptInfluence,
  };

  if (durationSeconds != null) {
    body.duration_seconds = Math.max(0.5, Math.min(30, durationSeconds));
  }

  try {
    const response = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `ElevenLabs API error ${response.status}: ${errorText}`,
      };
    }

    // Response is raw MP3 audio data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);

    // Estimate duration from file size (MP3 ~16KB/s at 128kbps)
    // ElevenLabs returns the duration in headers when available
    const contentLength = buffer.length;
    const estimatedDuration = durationSeconds ?? contentLength / 16000;

    return {
      success: true,
      durationSeconds: estimatedDuration,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || "Unknown ElevenLabs error",
    };
  }
}
