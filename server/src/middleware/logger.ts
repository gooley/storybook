import type { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Skip noisy health checks
    if (url === "/api/healthz") return;

    const statusTag =
      status >= 500 ? "ERR" : status >= 400 ? "WARN" : "OK";

    console.log(
      `[${statusTag}] ${method} ${url} → ${status} (${duration}ms)`
    );
  });

  next();
}
