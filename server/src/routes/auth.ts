import { Router, Request, Response } from "express";
import {
  verifyPassword,
  createSessionToken,
  validateSessionToken,
  hasPassword,
  setPassword,
  getAuthMode,
} from "../services/config";

const router = Router();

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `storybook_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_MS / 1000}`
  );
}

// POST /api/auth/login
router.post("/login", (req: Request, res: Response) => {
  if (getAuthMode() === "external") {
    res.json({ success: true, message: "External auth mode — no login needed" });
    return;
  }

  const { password } = req.body;
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  if (!verifyPassword(password)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({ success: true });
});

// GET /api/auth/check — check if current session is authenticated
router.get("/check", (req: Request, res: Response) => {
  if (getAuthMode() === "external") {
    res.json({ authenticated: true, authMode: "external" });
    return;
  }

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("storybook_session="));
  const token = match ? decodeURIComponent(match.split("=")[1]) : null;

  if (token && validateSessionToken(token)) {
    res.json({ authenticated: true, authMode: "local" });
  } else {
    res.json({ authenticated: false, authMode: "local" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", (req: Request, res: Response) => {
  if (getAuthMode() === "external") {
    res.status(400).json({ error: "Password not used in external auth mode" });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }

  if (!verifyPassword(currentPassword)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 4) {
    res.status(400).json({ error: "New password must be at least 4 characters" });
    return;
  }

  setPassword(newPassword);
  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({ success: true });
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.setHeader(
    "Set-Cookie",
    "storybook_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  res.json({ success: true });
});

export default router;
