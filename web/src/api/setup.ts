const BASE = "/api";

export interface SetupStatus {
  needsSetup: boolean;
  needsPassword: boolean;
  needsApiKey: boolean;
  authMode: "local" | "external";
}

export interface AuthCheck {
  authenticated: boolean;
  authMode: string;
}

export interface SystemInfo extends SetupStatus {
  apiKeyConfigured: boolean;
  apiKeySource: "environment" | "database" | "none";
  apiKeyPreview: string | null;
  elevenLabsKeyConfigured: boolean;
  elevenLabsKeySource: "environment" | "database" | "none";
  elevenLabsKeyPreview: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export const getSetupStatus = () => request<SetupStatus>("/setup/status");

export const setPassword = (password: string) =>
  request<{ success: boolean }>("/setup/set-password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const validateApiKey = (apiKey: string) =>
  request<{ valid: boolean; error?: string }>("/setup/validate-key", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });

export const saveApiKey = (apiKey: string) =>
  request<{ success: boolean }>("/setup/save-key", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });

export const validateElevenLabsKey = (apiKey: string) =>
  request<{ valid: boolean; error?: string }>("/setup/validate-elevenlabs-key", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });

export const saveElevenLabsKey = (apiKey: string) =>
  request<{ success: boolean }>("/setup/save-elevenlabs-key", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });

export const getSystemInfo = () => request<SystemInfo>("/setup/system");

export const login = (password: string) =>
  request<{ success: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const checkAuth = () => request<AuthCheck>("/auth/check");

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ success: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

export const logout = () =>
  request<{ success: boolean }>("/auth/logout", { method: "POST" });
