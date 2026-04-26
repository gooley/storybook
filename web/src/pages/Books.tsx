import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getBooks, getBookCoverUrl, updateBook, type Book } from "../api/client";

export function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setBooks(await getBooks()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleHidden = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    const updated = await updateBook(book.id, { hidden: book.hidden ? 0 : 1 });
    setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  const hiddenCount = books.filter(b => b.hidden).length;
  const visibleBooks = showHidden ? books : books.filter(b => !b.hidden);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = visibleBooks.length > 0 && normalizedSearch.length > 0;
  const filteredBooks = isSearching
    ? visibleBooks.filter((book) =>
        book.title.toLowerCase().includes(normalizedSearch) ||
        book.description.toLowerCase().includes(normalizedSearch)
      )
    : visibleBooks;
  const emptyMessage = visibleBooks.length === 0 && hiddenCount > 0
    ? "All books are hidden."
    : isSearching
      ? "No stories match your search."
      : "No stories yet. Generate one on your e-reader!";

  const emptyIcon = isSearching ? "🔎" : "📖";

  return (
    <div>
      <div className="page-header">
        <h2>📚 Bookshelf</h2>
        {hiddenCount > 0 && (
          <label className="show-hidden-toggle">
            <input type="checkbox" checked={showHidden} onChange={() => setShowHidden(!showHidden)} />
            Show hidden ({hiddenCount})
          </label>
        )}
      </div>
      {visibleBooks.length > 0 && (
        <div className="bookshelf-search">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search stories"
            aria-label="Search stories"
          />
        </div>
      )}
      {filteredBooks.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">{emptyIcon}</div>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="card-grid">
          {filteredBooks.map((book) => (
            <div key={book.id} className={`book-cover${book.hidden ? " hidden" : ""}`} onClick={() => navigate(`/read/${book.id}`)}>
              <button
                className="detail-btn"
                onClick={(e) => { e.stopPropagation(); navigate(`/reader/${book.id}`); }}
                title="Classic reader & debug"
              >
                🔍
              </button>
              <button
                className="visibility-btn"
                onClick={(e) => toggleHidden(e, book)}
                title={book.hidden ? "Show on device" : "Hide from device"}
              >
                {book.hidden ? "👁" : "🙈"}
              </button>
              {book.has_audio ? <span className="audio-badge" title="Has audio">🔊</span> : null}
              {book.cover_image_path ? (
                <img src={getBookCoverUrl(book.id)} alt={book.title}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="book-cover-fallback">
                  <span className="emoji">📖</span>
                  <span className="fallback-title">{book.title}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
