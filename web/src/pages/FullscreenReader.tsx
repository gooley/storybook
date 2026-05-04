import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBook, getBookPages, getPageImageUrl, getPageAudio, getAudioFileUrl,
  type Book, type Page, type PageAudio,
} from "../api/client";
import { ShareStoryButton } from "../components/ShareStoryButton";
import "./fullscreen-reader.css";

function useAudioManager(soundEnabled: boolean) {
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const currentAmbientUrl = useRef<string | null>(null);

  const playAmbient = useCallback((url: string | null) => {
    if (!url) {
      if (ambientRef.current) { ambientRef.current.pause(); ambientRef.current = null; currentAmbientUrl.current = null; }
      return;
    }
    if (currentAmbientUrl.current === url) return;
    if (ambientRef.current) ambientRef.current.pause();
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.5;
    audio.play().catch(() => {});
    ambientRef.current = audio;
    currentAmbientUrl.current = url;
  }, []);

  const playSfx = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    // Duck ambient during SFX
    if (ambientRef.current) ambientRef.current.volume = 0.2;
    let index = 0;
    const playNext = () => {
      if (index >= urls.length) {
        if (ambientRef.current) ambientRef.current.volume = 0.5;
        return;
      }
      const audio = new Audio(urls[index]);
      audio.volume = 0.8;
      sfxRef.current = audio;
      audio.onended = () => { index++; playNext(); };
      audio.play().catch(() => { if (ambientRef.current) ambientRef.current.volume = 0.5; });
    };
    playNext();
  }, []);

  const stopAll = useCallback(() => {
    if (ambientRef.current) { ambientRef.current.pause(); ambientRef.current = null; currentAmbientUrl.current = null; }
    if (sfxRef.current) { sfxRef.current.pause(); sfxRef.current = null; }
  }, []);

  useEffect(() => { if (!soundEnabled) stopAll(); }, [soundEnabled, stopAll]);
  useEffect(() => () => stopAll(), [stopAll]);

  return { playAmbient, playSfx, stopAll };
}

const SWIPE_THRESHOLD = 50;
const CONTROLS_TIMEOUT = 3000;

export function FullscreenReader() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [textVisible, setTextVisible] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [pageAudioMap, setPageAudioMap] = useState<Record<string, PageAudio[]>>({});

  const pointerStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { playAmbient, playSfx } = useAudioManager(soundEnabled);

  // Load book data
  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const [b, p] = await Promise.all([getBook(bookId), getBookPages(bookId)]);
      setBook(b);
      setPages(p);
      const audioMap: Record<string, PageAudio[]> = {};
      const audioResults = await Promise.all(p.map((pg) => getPageAudio(pg.id).catch(() => [])));
      p.forEach((pg, i) => { audioMap[pg.id] = audioResults[i]; });
      setPageAudioMap(audioMap);
    } finally { setLoading(false); }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  // Play ambient on page change
  useEffect(() => {
    if (!soundEnabled || pages.length === 0) return;
    const page = pages[currentPage];
    if (!page) return;
    const audioEntries = pageAudioMap[page.id] || [];
    const ambient = audioEntries.find((a) => a.audio_type === "ambient");
    playAmbient(ambient ? getAudioFileUrl(ambient.id) : null);
  }, [currentPage, soundEnabled, pages, pageAudioMap, playAmbient]);

  // Preload adjacent page images
  useEffect(() => {
    if (pages.length === 0) return;
    const toPreload = [currentPage - 1, currentPage + 1].filter(i => i >= 0 && i < pages.length);
    toPreload.forEach(i => {
      const p = pages[i];
      if (p?.image_path) {
        const img = new Image();
        img.src = getPageImageUrl(p.id);
      }
    });
  }, [currentPage, pages]);

  // Navigation
  const goNext = useCallback(() => {
    setCurrentPage(p => Math.min(p + 1, pages.length - 1));
    setTextVisible(true);
  }, [pages.length]);

  const goPrev = useCallback(() => {
    setCurrentPage(p => Math.max(p - 1, 0));
    setTextVisible(true);
  }, []);

  const handleCenterTap = useCallback(() => {
    if (soundEnabled) {
      const page = pages[currentPage];
      if (page) {
        const audioEntries = pageAudioMap[page.id] || [];
        const sfxEntries = audioEntries.filter(a => a.audio_type === "sfx");
        if (textVisible && sfxEntries.length > 0) {
          setTextVisible(false);
          playSfx(sfxEntries.map(s => getAudioFileUrl(s.id)));
          return;
        }
      }
    }
    setTextVisible(v => !v);
  }, [soundEnabled, currentPage, pages, pageAudioMap, textVisible, playSfx]);

  // Controls overlay auto-hide
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), CONTROLS_TIMEOUT);
  }, []);

  const exitReader = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate("/");
  }, [navigate]);

  // Pointer handling for taps and swipes
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const start = pointerStart.current;
    if (!start) return;
    pointerStart.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const elapsed = Date.now() - start.time;

    // Swipe detection (horizontal swipe, not too slow)
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 500) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    // Tap zone detection
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    // Top 10%: toggle controls
    if (relY < 0.1) {
      showControlsTemporarily();
      return;
    }

    // Bottom 90%: navigation zones
    if (relX < 0.2) goPrev();
    else if (relX > 0.8) goNext();
    else handleCenterTap();
  }, [goNext, goPrev, handleCenterTap, showControlsTemporarily]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "Escape") exitReader();
      else if (e.key === "f") {
        const el = containerRef.current;
        if (el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, exitReader]);

  // Try fullscreen on first user interaction
  const hasRequestedFullscreen = useRef(false);
  useEffect(() => {
    if (hasRequestedFullscreen.current) return;
    const requestFs = () => {
      if (hasRequestedFullscreen.current) return;
      hasRequestedFullscreen.current = true;
      containerRef.current?.requestFullscreen?.().catch(() => {});
      document.removeEventListener("pointerdown", requestFs);
    };
    document.addEventListener("pointerdown", requestFs, { once: true });
    return () => document.removeEventListener("pointerdown", requestFs);
  }, []);

  // Cleanup fullscreen on unmount
  useEffect(() => () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  if (loading) {
    return <div className="fs-reader fs-loading"><div className="fs-loading-text">Loading…</div></div>;
  }
  if (!book || pages.length === 0) {
    return (
      <div className="fs-reader fs-loading">
        <div className="fs-loading-text">
          {!book ? "Book not found" : "No pages in this book"}
          <br />
          <button className="fs-exit-btn" onClick={exitReader} style={{ marginTop: 16 }}>← Back</button>
        </div>
      </div>
    );
  }

  const page = pages[currentPage];
  const audioEntries = pageAudioMap[page.id] || [];
  const hasAudio = audioEntries.length > 0;
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === pages.length - 1;

  return (
    <div
      ref={containerRef}
      className="fs-reader"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Image */}
      <div className="fs-image">
        {page.image_path ? (
          <img
            key={page.id}
            src={getPageImageUrl(page.id)}
            alt={`Page ${page.page_number}`}
            draggable={false}
          />
        ) : (
          <div className="fs-image-placeholder">📖</div>
        )}
      </div>

      {/* Text overlay */}
      {textVisible && page.text && (
        <div className="fs-text">
          <p>{page.text}</p>
        </div>
      )}

      {/* Page edge indicators */}
      {!isFirstPage && <div className="fs-edge-hint fs-edge-left" />}
      {!isLastPage && <div className="fs-edge-hint fs-edge-right" />}

      {/* Always-visible page indicator */}
      <div className="fs-page-indicator">
        {currentPage + 1} / {pages.length}
      </div>

      {/* Sound indicator */}
      {soundEnabled && <div className="fs-sound-indicator">🔊</div>}

      {/* Controls overlay */}
      <div className={`fs-controls ${showControls ? "visible" : ""}`}>
        <button className="fs-ctrl-btn" onClick={exitReader}>✕</button>
        <div className="fs-ctrl-title">{book.title}</div>
        <div className="fs-ctrl-right">
          <ShareStoryButton bookId={bookId!} className="fs-ctrl-btn" label="🔗" title="Share story" />
          {hasAudio && (
            <button
              className="fs-ctrl-btn"
              onClick={(e) => { e.stopPropagation(); setSoundEnabled(s => !s); }}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
          )}
          <span className="fs-ctrl-pages">{currentPage + 1} / {pages.length}</span>
        </div>
      </div>
    </div>
  );
}
