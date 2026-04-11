import crypto from "crypto";
import db from "../db";

// --- Auth Mode ---

export type AuthMode = "local" | "external";

export function getAuthMode(): AuthMode {
  const mode = process.env.AUTH_MODE?.toLowerCase();
  if (mode === "external") return "external";
  return "local";
}

// --- Settings CRUD ---

function getSetting(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)"
  ).run(key, value, Date.now());
}

// --- OpenRouter API Key ---

export function getOpenRouterKey(): string {
  // Env var takes priority
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  return getSetting("openrouter_api_key") || "";
}

export function setOpenRouterKey(key: string): void {
  setSetting("openrouter_api_key", key);
}

export function hasOpenRouterKey(): boolean {
  return getOpenRouterKey().length > 0;
}

// --- Password ---

function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
}

export function setPassword(password: string): void {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = hashPassword(password, salt);
  setSetting("password_hash", hash);
  setSetting("password_salt", salt);
}

export function verifyPassword(password: string): boolean {
  const hash = getSetting("password_hash");
  const salt = getSetting("password_salt");
  if (!hash || !salt) return false;
  return hashPassword(password, salt) === hash;
}

export function hasPassword(): boolean {
  return !!getSetting("password_hash");
}

// --- Session Tokens ---

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSessionToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  setSetting("session_token", token);
  setSetting("session_created_at", Date.now().toString());
  return token;
}

export function validateSessionToken(token: string): boolean {
  const stored = getSetting("session_token");
  const createdAt = getSetting("session_created_at");
  if (!stored || !createdAt) return false;
  if (Date.now() - parseInt(createdAt, 10) > SESSION_TTL_MS) return false;
  // Reject malformed tokens before timingSafeEqual (which throws on length mismatch)
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  return crypto.timingSafeEqual(
    Buffer.from(token, "hex"),
    Buffer.from(stored, "hex")
  );
}

// --- Setup Status ---

export interface SetupStatus {
  needsSetup: boolean;
  needsPassword: boolean;
  needsApiKey: boolean;
  authMode: AuthMode;
}

export function getSetupStatus(): SetupStatus {
  const authMode = getAuthMode();

  if (authMode === "external") {
    // External auth (gool3yhost): skip password, just check API key
    return {
      needsSetup: !hasOpenRouterKey(),
      needsPassword: false,
      needsApiKey: !hasOpenRouterKey(),
      authMode,
    };
  }

  // Local auth: need both password and API key
  const needsPassword = !hasPassword();
  const needsApiKey = !hasOpenRouterKey();
  return {
    needsSetup: needsPassword || needsApiKey,
    needsPassword,
    needsApiKey,
    authMode,
  };
}

export function isFullyConfigured(): boolean {
  return !getSetupStatus().needsSetup;
}
