import { Router, Request, Response } from "express";
import {
  DEFAULT_STORY_MODEL,
  DEFAULT_ILLUSTRATION_MODEL,
  DEFAULT_COVER_MODEL,
} from "../services/openrouter";

const router = Router();

interface ModelOption {
  id: string;
  name: string;
  isDefault: boolean;
  compatibility: "tested" | "experimental";
}

interface ModelLists {
  story: ModelOption[];
  illustration: ModelOption[];
  cover: ModelOption[];
}

const MODEL_LISTS: ModelLists = {
  story: [
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", isDefault: true, compatibility: "tested" },
    { id: "openai/gpt-5", name: "GPT-5", isDefault: false, compatibility: "tested" },
    { id: "openai/gpt-5-mini", name: "GPT-5 Mini", isDefault: false, compatibility: "tested" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", isDefault: false, compatibility: "tested" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", isDefault: false, compatibility: "tested" },
    { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", isDefault: false, compatibility: "experimental" },
    { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", isDefault: false, compatibility: "experimental" },
  ],
  illustration: [
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", isDefault: true, compatibility: "tested" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", isDefault: false, compatibility: "tested" },
    { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", isDefault: false, compatibility: "tested" },
    { id: "openai/gpt-5-image", name: "GPT-5 Image", isDefault: false, compatibility: "tested" },
    { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", isDefault: false, compatibility: "tested" },
    { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", isDefault: false, compatibility: "experimental" },
    { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", isDefault: false, compatibility: "experimental" },
    { id: "black-forest-labs/flux.2-flex", name: "FLUX.2 Flex", isDefault: false, compatibility: "experimental" },
    { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B", isDefault: false, compatibility: "experimental" },
    { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", isDefault: false, compatibility: "experimental" },
    { id: "sourceful/riverflow-v2-pro", name: "Riverflow V2 Pro", isDefault: false, compatibility: "experimental" },
    { id: "sourceful/riverflow-v2-fast", name: "Riverflow V2 Fast", isDefault: false, compatibility: "experimental" },
  ],
  cover: [
    { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", isDefault: true, compatibility: "tested" },
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", isDefault: false, compatibility: "tested" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", isDefault: false, compatibility: "tested" },
    { id: "openai/gpt-5-image", name: "GPT-5 Image", isDefault: false, compatibility: "tested" },
    { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", isDefault: false, compatibility: "tested" },
    { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", isDefault: false, compatibility: "tested" },
    { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", isDefault: false, compatibility: "tested" },
    { id: "black-forest-labs/flux.2-flex", name: "FLUX.2 Flex", isDefault: false, compatibility: "tested" },
    { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B", isDefault: false, compatibility: "experimental" },
    { id: "sourceful/riverflow-v2-pro", name: "Riverflow V2 Pro", isDefault: false, compatibility: "experimental" },
    { id: "sourceful/riverflow-v2-fast", name: "Riverflow V2 Fast", isDefault: false, compatibility: "experimental" },
  ],
};

// GET /api/models — Return curated model lists per task type
router.get("/", (_req: Request, res: Response) => {
  res.json({
    ...MODEL_LISTS,
    defaults: {
      story: DEFAULT_STORY_MODEL,
      illustration: DEFAULT_ILLUSTRATION_MODEL,
      cover: DEFAULT_COVER_MODEL,
    },
  });
});

export default router;
