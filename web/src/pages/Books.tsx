import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getBooks, getBookCoverUrl, type Book } from "../api/client";

export function Books() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setBooks(await getBooks()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>📚 Bookshelf</h2>
      </div>
      {books.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📖</div>
          <p>No stories yet. Generate one on your e-reader!</p>
        </div>
      ) : (
        <div className="card-grid">
          {books.map((book) => (
            <div key={book.id} className="card" onClick={() => navigate(`/reader/${book.id}`)}>
              <div className="card-image">
                {book.cover_image_path ? (
                  <img src={getBookCoverUrl(book.id)} alt={book.title}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : "📖"}
              </div>
              <div className="card-body">
                <h3>{book.title}</h3>
                {book.description && (
                  <p>{book.description.length > 80 ? book.description.slice(0, 80) + "…" : book.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
