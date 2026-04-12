import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBook, getBookPages, getPageImageUrl, getPageAudio, getAudioFileUrl, type Book, type Page, type PageAudio } from "../api/client";

function useAudioManager(soundEnabled: boolean) {
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const currentAmbientUrl = useRef<string | null>(null);

  const playAmbient = useCallback((url: string | null) => {
    if (!url) {
      if (ambientRef.current) {
        ambientRef.current.pause();
        ambientRef.current = null;
        currentAmbientUrl.current = null;
      }
      return;
    }
    if (currentAmbientUrl.current === url) return;
    // Crossfade: fade out old, start new
    if (ambientRef.current) {
      const old = ambientRef.current;
      old.pause();
    }
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.5;
    audio.play().catch(() => {});
    ambientRef.current = audio;
    currentAmbientUrl.current = url;
  }, []);

  const playSfx = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    // Play SFX sequentially
    let index = 0;
    const playNext = () => {
      if (index >= urls.length) return;
      const audio = new Audio(urls[index]);
      audio.volume = 0.8;
      sfxRef.current = audio;
      audio.onended = () => {
        index++;
        playNext();
      };
      audio.play().catch(() => {});
    };
    playNext();
  }, []);

  const stopAll = useCallback(() => {
    if (ambientRef.current) {
      ambientRef.current.pause();
      ambientRef.current = null;
      currentAmbientUrl.current = null;
    }
    if (sfxRef.current) {
      sfxRef.current.pause();
      sfxRef.current = null;
    }
  }, []);

  // Stop when sound disabled
  useEffect(() => {
    if (!soundEnabled) stopAll();
  }, [soundEnabled, stopAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return { playAmbient, playSfx, stopAll };
}

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [textVisible, setTextVisible] = useState(true);
  const [pageAudioMap, setPageAudioMap] = useState<Record<string, PageAudio[]>>({});

  const { playAmbient, playSfx } = useAudioManager(soundEnabled);

  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const [b, p] = await Promise.all([getBook(bookId), getBookPages(bookId)]);
      setBook(b);
      setPages(p);
      // Load audio for all pages
      const audioMap: Record<string, PageAudio[]> = {};
      const audioResults = await Promise.all(p.map((pg) => getPageAudio(pg.id).catch(() => [])));
      p.forEach((pg, i) => { audioMap[pg.id] = audioResults[i]; });
      setPageAudioMap(audioMap);
    } finally { setLoading(false); }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  // Play ambient when page changes and sound is enabled
  useEffect(() => {
    if (!soundEnabled || pages.length === 0) return;
    const page = pages[currentPage];
    if (!page) return;
    const audioEntries = pageAudioMap[page.id] || [];
    const ambient = audioEntries.find((a) => a.audio_type === "ambient");
    playAmbient(ambient ? getAudioFileUrl(ambient.id) : null);
    setTextVisible(true); // Reset text visibility on page change
  }, [currentPage, soundEnabled, pages, pageAudioMap, playAmbient]);

  const handleImageClick = useCallback(() => {
    if (!soundEnabled) return;
    const page = pages[currentPage];
    if (!page) return;
    const audioEntries = pageAudioMap[page.id] || [];
    const sfxEntries = audioEntries.filter((a) => a.audio_type === "sfx");

    if (textVisible && sfxEntries.length > 0) {
      setTextVisible(false);
      playSfx(sfxEntries.map((s) => getAudioFileUrl(s.id)));
    } else {
      setTextVisible(true);
    }
  }, [soundEnabled, currentPage, pages, pageAudioMap, textVisible, playSfx]);

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
  const audioEntries = pageAudioMap[page.id] || [];
  const hasAudio = audioEntries.length > 0;
  const hasSfx = audioEntries.some((a) => a.audio_type === "sfx");

  return (
    <div className="reader">
      <div className="reader-nav">
        <div className="reader-nav-left">
          <button className="btn btn-secondary" onClick={() => navigate("/")}>← Back</button>
          {hasAudio && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setSoundEnabled((s) => !s)}
              title={soundEnabled ? "Mute sound" : "Enable sound"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
          )}
        </div>
        <h2>{book.title}</h2>
        <div className="reader-nav-right">
          <button className="btn btn-secondary btn-small" onClick={() => navigate(`/create?from=${bookId}`)}>🔄 Variation</button>
          <button className="btn btn-secondary btn-small" onClick={() => navigate(`/reader/${bookId}/debug`)}>🔍 Debug</button>
          <span className="reader-page-num">{currentPage + 1} / {pages.length}</span>
        </div>
      </div>
      <div className="reader-page">
        {page.image_path && (
          <img
            src={getPageImageUrl(page.id)}
            alt={`Page ${page.page_number}`}
            onClick={handleImageClick}
            style={{ cursor: soundEnabled && hasSfx ? "pointer" : "default" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {textVisible && <div className="page-text">{page.text}</div>}
        {!textVisible && soundEnabled && (
          <div className="page-text" style={{ opacity: 0.4, fontStyle: "italic", textAlign: "center" }}>
            🔊 Tap image again to show text
          </div>
        )}
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
