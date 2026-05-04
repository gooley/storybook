import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import db, { getUploadsDir } from "../db";

const IMAGE_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

interface BookRow {
  id: string;
  title: string;
  description: string;
  cover_image_path: string | null;
  created_at: number;
}

interface PageRow {
  id: string;
  page_number: number;
  text: string;
  image_path: string | null;
}

export interface SharedBook {
  id: string;
  book_id: string;
  title: string | null;
  snapshot_html: string;
  snapshot_metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface BookShareSummary {
  id: string;
  book_id: string;
  title: string | null;
  snapshot_metadata: string | null;
  created_at: number;
  updated_at: number;
  isNew?: boolean;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineUploadImage(relativePath: string | null): string | null {
  if (!relativePath) return null;

  const uploadsDir = path.resolve(getUploadsDir());
  const filePath = path.resolve(uploadsDir, relativePath);
  if (!filePath.startsWith(uploadsDir + path.sep)) return null;
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = IMAGE_MIME_MAP[ext] || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function getBook(bookId: string): BookRow | null {
  return (db
    .prepare("SELECT id, title, description, cover_image_path, created_at FROM books WHERE id = ? AND deleted_at IS NULL")
    .get(bookId) as BookRow | undefined) || null;
}

function getBookPages(bookId: string): PageRow[] {
  return db
    .prepare("SELECT id, page_number, text, image_path FROM pages WHERE book_id = ? AND deleted_at IS NULL ORDER BY page_number")
    .all(bookId) as PageRow[];
}

export function generateShareSnapshot(bookId: string): { title: string; html: string; metadata: string } {
  const book = getBook(bookId);
  if (!book) {
    throw new Error("Book not found");
  }

  const pages = getBookPages(bookId);
  const coverImage = inlineUploadImage(book.cover_image_path);
  const coverHtml = coverImage
    ? `<div class="story-cover-image"><img src="${coverImage}" alt="${escapeHtml(book.title)} cover"></div>`
    : "";

  const pageHtml = pages.map((page) => {
    const image = inlineUploadImage(page.image_path);
    const imageHtml = image
      ? `<img src="${image}" alt="Page ${page.page_number}">`
      : `<div class="story-image-placeholder">Page ${page.page_number}</div>`;
    const textHtml = escapeHtml(page.text).replace(/\n/g, "<br>");

    return `
      <section class="story-page">
        <div class="story-image">${imageHtml}</div>
        <div class="story-text">${textHtml}</div>
      </section>
    `;
  }).join("");

  const html = `
    <section class="story-title-page">
      ${coverHtml}
      <h1>${escapeHtml(book.title)}</h1>
      ${book.description ? `<p>${escapeHtml(book.description)}</p>` : ""}
    </section>
    ${pageHtml || '<section class="story-empty">No pages in this story.</section>'}
  `;

  const metadata = JSON.stringify({
    page_count: pages.length,
    book_created_at: book.created_at,
  });

  return { title: book.title, html, metadata };
}

export function createOrUpdateShare(bookId: string): BookShareSummary {
  const snapshot = generateShareSnapshot(bookId);
  const now = Date.now();
  const existing = db
    .prepare("SELECT id, created_at FROM shared_books WHERE book_id = ?")
    .get(bookId) as { id: string; created_at: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE shared_books SET title = ?, snapshot_html = ?, snapshot_metadata = ?, updated_at = ? WHERE id = ?"
    ).run(snapshot.title, snapshot.html, snapshot.metadata, now, existing.id);

    return {
      id: existing.id,
      book_id: bookId,
      title: snapshot.title,
      snapshot_metadata: snapshot.metadata,
      created_at: existing.created_at,
      updated_at: now,
      isNew: false,
    };
  }

  const shareId = uuidv4();
  db.prepare(
    "INSERT INTO shared_books (id, book_id, title, snapshot_html, snapshot_metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(shareId, bookId, snapshot.title, snapshot.html, snapshot.metadata, now, now);

  return {
    id: shareId,
    book_id: bookId,
    title: snapshot.title,
    snapshot_metadata: snapshot.metadata,
    created_at: now,
    updated_at: now,
    isNew: true,
  };
}

export function getShareForBook(bookId: string): BookShareSummary | null {
  return (db
    .prepare("SELECT id, book_id, title, snapshot_metadata, created_at, updated_at FROM shared_books WHERE book_id = ?")
    .get(bookId) as BookShareSummary | undefined) || null;
}

export function deleteShare(bookId: string): boolean {
  const result = db.prepare("DELETE FROM shared_books WHERE book_id = ?").run(bookId);
  return result.changes > 0;
}

export function getSharedBook(shareId: string): SharedBook | null {
  return (db
    .prepare("SELECT id, book_id, title, snapshot_html, snapshot_metadata, created_at, updated_at FROM shared_books WHERE id = ?")
    .get(shareId) as SharedBook | undefined) || null;
}

function formatShareDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function renderSharedBookPage(shared: SharedBook): string {
  const title = shared.title || "Shared Story";
  const escapedTitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle} - Storybook</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fffbf5;
      --surface: #ffffff;
      --text: #1a1a1a;
      --muted: #666666;
      --border: #e0ddd8;
      --primary: #4a6741;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
    }
    .shared-shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .shared-header,
    .shared-footer {
      background: var(--surface);
      border-color: var(--border);
      border-style: solid;
      padding: 12px 20px;
    }
    .shared-header {
      border-width: 0 0 1px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .shared-title {
      font-weight: 700;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .shared-meta {
      color: var(--muted);
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .shared-story {
      width: min(900px, 100%);
      margin: 0 auto;
      padding: 24px;
    }
    .story-title-page,
    .story-page,
    .story-empty {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .story-title-page {
      padding: 28px;
      text-align: center;
    }
    .story-title-page h1 {
      margin: 16px 0 8px;
      font-size: clamp(2rem, 6vw, 4rem);
      line-height: 1.05;
      color: var(--primary);
    }
    .story-title-page p {
      margin: 0 auto;
      max-width: 620px;
      color: var(--muted);
      font-size: 1.05rem;
    }
    .story-cover-image img,
    .story-image img {
      display: block;
      width: 100%;
      height: auto;
    }
    .story-cover-image {
      max-width: 420px;
      margin: 0 auto;
      border-radius: 12px;
      overflow: hidden;
    }
    .story-image {
      background: #000000;
    }
    .story-image img {
      object-fit: contain;
      max-height: 75vh;
    }
    .story-image-placeholder,
    .story-empty {
      padding: 64px 24px;
      text-align: center;
      color: var(--muted);
    }
    .story-text {
      padding: 24px 28px 30px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.15rem, 3vw, 1.45rem);
      line-height: 1.75;
    }
    .shared-footer {
      border-width: 1px 0 0;
      color: var(--muted);
      font-size: 0.8rem;
      text-align: center;
      margin-top: auto;
    }
    @media (max-width: 640px) {
      .shared-header {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
      .shared-story {
        padding: 16px;
      }
      .story-text {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="shared-shell">
    <header class="shared-header">
      <div class="shared-title">${escapedTitle}</div>
      <div class="shared-meta">Shared via Storybook &middot; ${formatShareDate(shared.updated_at)}</div>
    </header>
    <main class="shared-story">
      ${shared.snapshot_html}
    </main>
    <footer class="shared-footer">This is a read-only snapshot. Content will not update unless the owner refreshes the share.</footer>
  </div>
</body>
</html>`;
}
