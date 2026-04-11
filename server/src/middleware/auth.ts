import { Request, Response, NextFunction } from "express";
import { getAuthMode, validateSessionToken, getSetupStatus } from "../services/config";

/**
 * Auth middleware.
 * - AUTH_MODE=external: all requests pass through (external proxy handles auth)
 * - AUTH_MODE=local: requires valid session token cookie, except public endpoints
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // External auth mode — skip entirely
  if (getAuthMode() === "external") {
    next();
    return;
  }

  // Public endpoints that never require auth
  const publicPaths = [
    "/api/healthz",
    "/api/setup/status",
    "/api/auth/login",
    "/api/setup/set-password",
  ];
  // req.originalUrl has the full path regardless of mount point
  const reqPath = req.originalUrl.split("?")[0];
  if (publicPaths.includes(reqPath)) {
    next();
    return;
  }

  // During initial setup, allow setup endpoints without auth
  const status = getSetupStatus();
  if (status.needsSetup && reqPath.startsWith("/api/setup/")) {
    next();
    return;
  }

  // Check session token from cookie
  const token = parseCookie(req.headers.cookie || "", "storybook_session");
  if (!token || !validateSessionToken(token)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  next();
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}
