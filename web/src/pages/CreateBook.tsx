import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCharacters,
  getCharacterPhotoUrl,
  getPageImageUrl,
  startGeneration,
  pollGenerationStatus,
  type Character,
  type GenerationStatus,
} from "../api/client";

const PAGE_COUNT_OPTIONS = [2, 4, 8];
const POLL_INTERVAL_FAST = 2000;
const POLL_INTERVAL_SLOW = 5000;
const SLOW_THRESHOLD_MS = 30000;

export function CreateBook() {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState(4);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const loadCharacters = useCallback(async () => {
    try {
      setCharacters(await getCharacters());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadCharacters]);

  const toggleCharacter = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPolling = (jobId: string, bookId: string) => {
    startTimeRef.current = Date.now();

    const poll = async () => {
      try {
        const s = await pollGenerationStatus(jobId);
        setStatus(s);

        // Show first illustration preview
        if (s.firstIllustrationReady && s.completedPageIds.length > 0 && !previewPageId) {
          setPreviewPageId(s.completedPageIds[0]);
        }

        if (s.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          // Short delay then navigate to reader
          setTimeout(() => navigate(`/reader/${bookId}`), 1000);
        } else if (s.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(s.errorMessage || "Generation failed");
          setGenerating(false);
        }
      } catch (e: any) {
        console.error("Poll error:", e);
      }
    };

    // Start with fast polling, switch to slow after threshold
    pollRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      poll();

      // Switch to slow polling after threshold
      if (elapsed > SLOW_THRESHOLD_MS && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = setInterval(poll, POLL_INTERVAL_SLOW);
      }
    }, POLL_INTERVAL_FAST);

    // Also poll immediately
    poll();
  };

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setError(null);
    setGenerating(true);
    setStatus(null);
    setPreviewPageId(null);

    try {
      const result = await startGeneration({
        description: description.trim(),
        pageCount,
        characterIds: Array.from(selectedIds),
      });
      startPolling(result.jobId, result.bookId);
    } catch (e: any) {
      setError(e.message || "Failed to start generation");
      setGenerating(false);
    }
  };

  const familyChars = characters.filter((c) => c.type === "family");
  const friendChars = characters.filter((c) => c.type === "friend");

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div className="create-page">
      <div className="page-header">
        <h2>✨ Create a Story</h2>
      </div>

      {!generating ? (
        <div className="create-form">
          <div className="form-group">
            <label>What's the story about?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dana goes on an adventure to find a magical forest where animals can talk…"
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="form-group">
            <label>Number of pages</label>
            <div className="page-count-options">
              {PAGE_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`page-count-btn ${pageCount === n ? "active" : ""}`}
                  onClick={() => setPageCount(n)}
                >
                  {n} pages
                </button>
              ))}
            </div>
          </div>

          {characters.length > 0 && (
            <div className="form-group">
              <label>Characters</label>
              <div className="character-picker">
                {familyChars.length > 0 && (
                  <div className="character-group">
                    <span className="character-group-label">Family</span>
                    <div className="character-chips">
                      {familyChars.map((c) => (
                        <button
                          key={c.id}
                          className={`character-chip ${selectedIds.has(c.id) ? "selected" : ""}`}
                          onClick={() => toggleCharacter(c.id)}
                        >
                          {c.photo_path && (
                            <img
                              src={getCharacterPhotoUrl(c.id)}
                              alt={c.name}
                              className="chip-photo"
                            />
                          )}
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {friendChars.length > 0 && (
                  <div className="character-group">
                    <span className="character-group-label">Friends</span>
                    <div className="character-chips">
                      {friendChars.map((c) => (
                        <button
                          key={c.id}
                          className={`character-chip ${selectedIds.has(c.id) ? "selected" : ""}`}
                          onClick={() => toggleCharacter(c.id)}
                        >
                          {c.photo_path && (
                            <img
                              src={getCharacterPhotoUrl(c.id)}
                              alt={c.name}
                              className="chip-photo"
                            />
                          )}
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button
            className="btn btn-primary generate-btn"
            onClick={handleGenerate}
            disabled={!description.trim()}
          >
            ✨ Generate Story
          </button>
        </div>
      ) : (
        <div className="generation-progress">
          <div className="progress-content">
            {previewPageId && (
              <div className="preview-image">
                <img
                  src={getPageImageUrl(previewPageId)}
                  alt="First illustration preview"
                />
              </div>
            )}

            <div className="progress-info">
              <p className="progress-message">
                {status?.progressMessage || "Starting generation…"}
              </p>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(status?.progressFraction ?? 0) * 100}%` }}
                />
              </div>
              <p className="progress-step">
                {status
                  ? `Step ${status.completedSteps} of ${status.totalSteps}`
                  : "Preparing…"}
              </p>
            </div>
          </div>

          {status?.status === "done" && (
            <p className="progress-done">✅ Story complete! Opening reader…</p>
          )}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}
    </div>
  );
}
