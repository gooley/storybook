import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBook, getBookPages, getPageImageUrl, type Book, type Page } from "../api/client";

export function AllImages() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const [b, p] = await Promise.all([getBook(bookId), getBookPages(bookId)]);
      setBook(b);
      setPages(p);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!book) return <div className="empty-state">Book not found</div>;
  if (pages.length === 0) return <div className="empty-state">No pages in this book</div>;

  return (
    <div className="all-images-page">
      <div className="all-images-header">
        <button className="btn btn-secondary" onClick={() => navigate(`/reader/${bookId}/debug`)}>
          ← Debug
        </button>
        <h2>🖼 All Images: {book.title}</h2>
        <button className="btn btn-secondary" onClick={() => navigate(`/reader/${bookId}`)}>
          📖 Reader
        </button>
      </div>
      <div className="all-images-grid">
        {pages.map((page) => (
          <div key={page.id} className="all-images-item">
            <div className="all-images-label">Page {page.page_number}</div>
            <div className="all-images-frame">
              {page.image_path ? (
                <img
                  src={getPageImageUrl(page.id)}
                  alt={`Page ${page.page_number}`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : (
                <div className="all-images-placeholder">No image</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
