import { Request, Response, NextFunction } from "express";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Health check is public
  if (req.path === "/api/healthz") {
    return next();
  }

  // Static files (React app) are public
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not set — auth disabled");
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}
