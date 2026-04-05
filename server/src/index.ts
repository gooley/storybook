import express from "express";
import cors from "cors";
import path from "path";
import { migrate } from "./db";
import { authMiddleware } from "./middleware/auth";
import charactersRouter from "./routes/characters";
import booksRouter from "./routes/books";
import syncRouter from "./routes/sync";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Run migrations
migrate();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(authMiddleware);

// API routes
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use("/api/characters", charactersRouter);
app.use("/api/books", booksRouter);
app.use("/api/sync", syncRouter);

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
