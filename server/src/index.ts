import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { migrate } from "./db";
import { authMiddleware } from "./middleware/auth";
import charactersRouter from "./routes/characters";
import locationsRouter from "./routes/locations";
import booksRouter from "./routes/books";
import syncRouter from "./routes/sync";
import generateRouter from "./routes/generate";
import modelsRouter from "./routes/models";
import setupRouter from "./routes/setup";
import authRouter from "./routes/auth";
import { startWorker, stopWorker } from "./services/generation";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Run migrations
migrate();

// Start generation worker
startWorker();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  stopWorker();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  stopWorker();
  process.exit(0);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health check (always public, before auth middleware)
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Auth middleware — gates all /api/* routes except public ones
app.use("/api", authMiddleware);

// API routes
app.use("/api/setup", setupRouter);
app.use("/api/auth", authRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/books", booksRouter);
app.use("/api/sync", syncRouter);
app.use("/api/generate", generateRouter);
app.use("/api/models", modelsRouter);

// Serve React SPA in production
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Storybook API listening on :${PORT}`);
});

export default app;
