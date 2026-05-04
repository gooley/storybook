import { Request, Response } from "express";
import { createOrUpdateShare, deleteShare, getShareForBook } from "../services/share";

function serializeShare(share: NonNullable<ReturnType<typeof getShareForBook>>) {
  return {
    id: share.id,
    book_id: share.book_id,
    title: share.title,
    url: `/s/${share.id}`,
    created_at: share.created_at,
    updated_at: share.updated_at,
    isNew: share.isNew,
  };
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value || "";
}

export function handleCreateShare(req: Request, res: Response): void {
  try {
    const share = createOrUpdateShare(routeParam(req.params.id));
    res.json({ ok: true, share: serializeShare(share) });
  } catch (err) {
    if (err instanceof Error && err.message === "Book not found") {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create share" });
  }
}

export function handleGetShare(req: Request, res: Response): void {
  const share = getShareForBook(routeParam(req.params.id));
  res.json(share ? serializeShare(share) : null);
}

export function handleDeleteShare(req: Request, res: Response): void {
  const deleted = deleteShare(routeParam(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "Share not found" });
    return;
  }
  res.json({ ok: true });
}
