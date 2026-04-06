import { Router, Request, Response } from "express";
import {
  DEFAULT_STORY_MODEL,
  DEFAULT_ILLUSTRATION_MODEL,
  DEFAULT_COVER_MODEL,
} from "../services/openrouter";

const router = Router();

interface ModelEntry {
  id: string;
  name: string;
  compatibility: "tested" | "experimental";
}

interface ModelOption extends ModelEntry {
  isDefault: boolean;
}

const STORY_MODELS: ModelEntry[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", compatibility: "tested" },
  { id: "openai/gpt-5", name: "GPT-5", compatibility: "tested" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", compatibility: "tested" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", compatibility: "tested" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", compatibility: "tested" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", compatibility: "experimental" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", compatibility: "experimental" },
];

const ILLUSTRATION_MODELS: ModelEntry[] = [
  { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", compatibility: "tested" },
  { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", compatibility: "tested" },
  { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", compatibility: "tested" },
  { id: "openai/gpt-5-image", name: "GPT-5 Image", compatibility: "tested" },
  { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", compatibility: "tested" },
  { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", compatibility: "experimental" },
  { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", compatibility: "experimental" },
  { id: "black-forest-labs/flux.2-flex", name: "FLUX.2 Flex", compatibility: "experimental" },
  { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B", compatibility: "experimental" },
  { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", compatibility: "experimental" },
  { id: "sourceful/riverflow-v2-pro", name: "Riverflow V2 Pro", compatibility: "experimental" },
  { id: "sourceful/riverflow-v2-fast", name: "Riverflow V2 Fast", compatibility: "experimental" },
];

const COVER_MODELS: ModelEntry[] = [
  { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", compatibility: "tested" },
  { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", compatibility: "tested" },
  { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", compatibility: "tested" },
  { id: "openai/gpt-5-image", name: "GPT-5 Image", compatibility: "tested" },
  { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", compatibility: "tested" },
  { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", compatibility: "tested" },
  { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", compatibility: "tested" },
  { id: "black-forest-labs/flux.2-flex", name: "FLUX.2 Flex", compatibility: "tested" },
  { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B", compatibility: "experimental" },
  { id: "sourceful/riverflow-v2-pro", name: "Riverflow V2 Pro", compatibility: "experimental" },
  { id: "sourceful/riverflow-v2-fast", name: "Riverflow V2 Fast", compatibility: "experimental" },
];

function withDefaults(models: ModelEntry[], defaultId: string): ModelOption[] {
  return models.map((m) => ({ ...m, isDefault: m.id === defaultId }));
}

// GET /api/models — Return curated model lists per task type
router.get("/", (_req: Request, res: Response) => {
  res.json({
    story: withDefaults(STORY_MODELS, DEFAULT_STORY_MODEL),
    illustration: withDefaults(ILLUSTRATION_MODELS, DEFAULT_ILLUSTRATION_MODEL),
    cover: withDefaults(COVER_MODELS, DEFAULT_COVER_MODEL),
    defaults: {
      story: DEFAULT_STORY_MODEL,
      illustration: DEFAULT_ILLUSTRATION_MODEL,
      cover: DEFAULT_COVER_MODEL,
    },
  });
});

export default router;
