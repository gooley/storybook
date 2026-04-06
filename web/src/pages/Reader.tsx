import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBook, getBookPages, getPageImageUrl, type Book, type Page } from "../api/client";

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const [b, p] = await Promise.all([getBook(bookId), getBookPages(bookId)]);
      setBook(b);
      setPages(p);
    } finally { setLoading(false); }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
      else if (e.key === "ArrowLeft") setCurrentPage((p) => Math.max(p - 1, 0));
      else if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pages.length, navigate]);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!book) return <div className="empty-state">Book not found</div>;
  if (pages.length === 0) return <div className="empty-state">No pages in this book</div>;

  const page = pages[currentPage];

  return (
    <div className="reader">
      <div className="reader-nav">
        <button className="btn btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <h2>{book.title}</h2>
        <div className="reader-nav-right">
          <button className="btn btn-secondary btn-small" onClick={() => navigate(`/create?from=${bookId}`)}>🔄 Variation</button>
          <button className="btn btn-secondary btn-small" onClick={() => navigate(`/reader/${bookId}/debug`)}>🔍 Debug</button>
          <span className="reader-page-num">{currentPage + 1} / {pages.length}</span>
        </div>
      </div>
      <div className="reader-page">
        {page.image_path && (
          <img src={getPageImageUrl(page.id)} alt={`Page ${page.page_number}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="page-text">{page.text}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button className="btn btn-secondary" disabled={currentPage === 0}
          onClick={() => setCurrentPage((p) => p - 1)}>← Previous</button>
        <button className="btn btn-secondary" disabled={currentPage === pages.length - 1}
          onClick={() => setCurrentPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  );
}
