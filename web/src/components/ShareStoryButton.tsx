import { useState, type MouseEvent } from "react";
import {
  createBookShare,
  deleteBookShare,
  getBookShare,
  type BookShare,
} from "../api/client";

interface ShareStoryButtonProps {
  bookId: string;
  className?: string;
  label?: string;
  title?: string;
}

function absoluteShareUrl(share: BookShare): string {
  return `${window.location.origin}${share.url}`;
}

function copyFallback(text: string, onSuccess: () => void): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
  onSuccess();
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await new Promise<void>((resolve) => copyFallback(text, resolve));
}

export function ShareStoryButton({
  bookId,
  className = "btn btn-secondary btn-small",
  label = "Share",
  title = "Share story",
}: ShareStoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [share, setShare] = useState<BookShare | null>(null);
  const [status, setStatus] = useState("");

  const openShare = async (event: MouseEvent) => {
    event.stopPropagation();
    setOpen(true);
    setStatus("");
    setLoading(true);
    try {
      setShare(await getBookShare(bookId));
    } finally {
      setLoading(false);
    }
  };

  const closeShare = () => {
    setOpen(false);
    setStatus("");
  };

  const createOrUpdate = async () => {
    setLoading(true);
    setStatus("");
    try {
      const result = await createBookShare(bookId);
      setShare(result.share);
      await copyText(absoluteShareUrl(result.share));
      setStatus(result.share.isNew ? "Share link copied." : "Snapshot updated and copied.");
    } finally {
      setLoading(false);
    }
  };

  const copyShare = async () => {
    if (!share) return;
    await copyText(absoluteShareUrl(share));
    setStatus("Share link copied.");
  };

  const removeShare = async () => {
    if (!share) return;
    if (!window.confirm("Remove the shared link? Anyone with the link will no longer be able to view it.")) return;
    setLoading(true);
    setStatus("");
    try {
      await deleteBookShare(bookId);
      setShare(null);
      setStatus("Share link removed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className={className} onClick={openShare} title={title}>
        {label}
      </button>
      {open && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            closeShare();
          }}
        >
          <div className="modal share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="share-modal-header">
              <h3>Share Story</h3>
              <button className="share-close-btn" onClick={closeShare} aria-label="Close share dialog">
                x
              </button>
            </div>
            {loading && !share ? (
              <p className="share-help">Loading...</p>
            ) : share ? (
              <>
                <p className="share-help">Anyone with this link can view a read-only snapshot:</p>
                <div className="share-url-row">
                  <input className="share-url-input" value={absoluteShareUrl(share)} readOnly />
                  <button className="btn btn-secondary btn-small" onClick={copyShare} disabled={loading}>
                    Copy
                  </button>
                </div>
                <div className="share-updated-at">
                  Last updated: {new Date(share.updated_at).toLocaleString()}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={createOrUpdate} disabled={loading}>
                    Update Snapshot
                  </button>
                  <button className="btn btn-danger" onClick={removeShare} disabled={loading}>
                    Unshare
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="share-help">Create a public, read-only snapshot of this story. Anyone with the link can view it.</p>
                <button className="btn btn-primary share-create-btn" onClick={createOrUpdate} disabled={loading}>
                  Create Share Link
                </button>
              </>
            )}
            {status && <div className="share-status">{status}</div>}
          </div>
        </div>
      )}
    </>
  );
}
