import { Router, Request, Response } from "express";
import {
  getSetupStatus,
  setPassword,
  hasPassword,
  setOpenRouterKey,
  getOpenRouterKey,
  hasOpenRouterKey,
  getAuthMode,
} from "../services/config";

const router = Router();

// GET /api/setup/status — always public
router.get("/status", (_req: Request, res: Response) => {
  res.json(getSetupStatus());
});

// POST /api/setup/set-password — set password during initial setup
router.post("/set-password", (req: Request, res: Response) => {
  if (getAuthMode() === "external") {
    res.status(400).json({ error: "Password not required in external auth mode" });
    return;
  }

  if (hasPassword()) {
    res.status(400).json({ error: "Password already set. Use settings to change it." });
    return;
  }

  const { password } = req.body;
  if (!password || typeof password !== "string" || password.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }

  setPassword(password);
  res.json({ success: true });
});

// POST /api/setup/validate-key — test an OpenRouter API key
router.post("/validate-key", async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "API key is required" });
    return;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) {
      res.json({ valid: true });
    } else if (response.status === 401) {
      res.json({ valid: false, error: "Invalid API key" });
    } else {
      res.json({ valid: false, error: `OpenRouter returned status ${response.status}` });
    }
  } catch (err) {
    res.json({ valid: false, error: "Could not reach OpenRouter. Check your internet connection." });
  }
});

// POST /api/setup/save-key — save a validated API key
router.post("/save-key", (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "API key is required" });
    return;
  }

  setOpenRouterKey(apiKey);
  res.json({ success: true });
});

// GET /api/setup/system — system health info
router.get("/system", (_req: Request, res: Response) => {
  const status = getSetupStatus();
  const key = getOpenRouterKey();

  res.json({
    ...status,
    apiKeyConfigured: hasOpenRouterKey(),
    apiKeySource: process.env.OPENROUTER_API_KEY ? "environment" : key ? "database" : "none",
    apiKeyPreview: key ? `sk-or-...${key.slice(-4)}` : null,
  });
});

export default router;
