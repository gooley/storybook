import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBook,
  getBookGenerationLogs,
  getPageAudio,
  getBookPages,
  generateBookAudio,
  pollGenerationStatus,
  getAudioFileUrl,
  getUploadUrl,
  getPageImageUrl,
  getBookCoverUrl,
  type Book,
  type GenerationLog,
} from "../api/client";

const STEP_LABELS: Record<string, string> = {
  story: "📝 Story",
  illustration: "🎨 Illustration",
  cover: "📕 Cover",
  sound_design: "🎵 Sound Design",
  audio: "🔊 Audio",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function shortModel(model: string): string {
  // "google/gemini-3.1-flash-image-preview" → "gemini-3.1-flash-image-preview"
  return model.includes("/") ? model.split("/").pop()! : model;
}

function extractAudioId(responseText: string | null): string | null {
  if (!responseText) return null;
  const match = responseText.match(/audio_id:(\S+)/);
  return match ? match[1] : null;
}

function LogEntry({ log }: { log: GenerationLog }) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = log.success === 1;
  const characterRefs = log.character_refs_json
    ? JSON.parse(log.character_refs_json)
    : null;
  const audioId = log.step_type === "audio" ? extractAudioId(log.response_text) : null;

  // Parse input image paths
  const inputImagePaths: string[] = log.input_image_paths_json
    ? JSON.parse(log.input_image_paths_json)
    : [];

  // Determine output image URL
  let outputImageUrl: string | null = null;
  if (log.output_image_path) {
    outputImageUrl = getUploadUrl(log.output_image_path);
  } else if (isSuccess) {
    // Fallback for older logs without stored paths
    if (log.step_type === "illustration" && log.page_id) {
      outputImageUrl = getPageImageUrl(log.page_id);
    } else if (log.step_type === "cover" && log.book_id) {
      outputImageUrl = getBookCoverUrl(log.book_id);
    }
  }

  const hasImages = inputImagePaths.length > 0 || outputImageUrl;

  return (
    <div
      className={`debug-log-entry ${isSuccess ? "success" : "failure"}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="debug-log-header">
        <span className="debug-log-type">
          {STEP_LABELS[log.step_type] || log.step_type}
        </span>
        <span className={`debug-log-status ${isSuccess ? "ok" : "err"}`}>
          {isSuccess ? "✓" : "✗"}
        </span>
        <span className="debug-log-model" title={log.model}>
          {shortModel(log.response_model || log.model)}
        </span>
        <span className="debug-log-duration">
          {formatDuration(log.duration_ms)}
        </span>
        <span className="debug-log-images">
          {log.num_images_attached > 0 && `📎 ${log.num_images_attached}`}
          {log.had_reference_image === 1 && " 🖼"}
        </span>
        <span className="debug-log-time">{formatTime(log.created_at)}</span>
        {audioId && (
          <audio
            controls
            preload="none"
            src={getAudioFileUrl(audioId)}
            onClick={(e) => e.stopPropagation()}
            style={{ height: 28, marginLeft: 8, verticalAlign: "middle" }}
          />
        )}
        <span className="debug-log-expand">{expanded ? "▾" : "▸"}</span>
      </div>

      {!isSuccess && log.error_message && !expanded && (
        <div className="debug-log-error-preview">
          {log.error_message.slice(0, 120)}
        </div>
      )}

      {expanded && (
        <div className="debug-log-details" onClick={(e) => e.stopPropagation()}>
          {hasImages && (
            <div className="debug-log-section">
              {inputImagePaths.length > 0 && (
                <>
                  <h4>Input Images ({inputImagePaths.length})</h4>
                  <div className="debug-image-grid">
                    {inputImagePaths.map((imgPath, i) => (
                      <div key={i} className="debug-image-item">
                        <img
                          src={getUploadUrl(imgPath)}
                          alt={`Input ${i + 1}`}
                          loading="lazy"
                        />
                        <span className="debug-image-label" title={imgPath}>
                          {imgPath.split("/").pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {outputImageUrl && (
                <>
                  <h4>Output Image</h4>
                  <div className="debug-image-grid debug-image-output">
                    <div className="debug-image-item">
                      <img
                        src={outputImageUrl}
                        alt="Output"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="debug-log-section">
            <h4>Prompt</h4>
            <pre className="debug-log-pre">{log.prompt}</pre>
          </div>

          {log.system_prompt && (
            <div className="debug-log-section">
              <h4>System Prompt</h4>
              <pre className="debug-log-pre">{log.system_prompt}</pre>
            </div>
          )}

          {characterRefs && characterRefs.length > 0 && (
            <div className="debug-log-section">
              <h4>Characters</h4>
              <ul>
                {characterRefs.map((c: any, i: number) => (
                  <li key={i}>
                    <strong>{c.name}</strong>: {c.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {log.response_text && (
            <div className="debug-log-section">
              <h4>Response</h4>
              <pre className="debug-log-pre">{log.response_text}</pre>
            </div>
          )}

          {log.error_message && (
            <div className="debug-log-section">
              <h4>Error</h4>
              <pre className="debug-log-pre debug-log-error">
                {log.error_message}
              </pre>
            </div>
          )}

          <div className="debug-log-meta">
            <span>
              <strong>Model:</strong> {log.model}
            </span>
            {log.response_model && log.response_model !== log.model && (
              <span>
                <strong>Response model:</strong> {log.response_model}
              </span>
            )}
            <span>
              <strong>Images attached:</strong> {log.num_images_attached}
            </span>
            <span>
              <strong>Reference image:</strong>{" "}
              {log.had_reference_image ? "Yes" : "No"}
            </span>
            {log.page_id && (
              <span>
                <strong>Page ID:</strong>{" "}
                <code>{log.page_id}</code>
              </span>
            )}
            {log.job_id && (
              <span>
                <strong>Job ID:</strong>{" "}
                <code>{log.job_id}</code>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function BookDebug() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [hasAudio, setHasAudio] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioProgress, setAudioProgress] = useState("");

  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const [b, l, pages] = await Promise.all([
        getBook(bookId),
        getBookGenerationLogs(bookId),
        getBookPages(bookId),
      ]);
      setBook(b);
      setLogs(l);
      // Check if any page has audio
      if (pages.length > 0) {
        const firstPageAudio = await getPageAudio(pages[0].id).catch(() => []);
        setHasAudio(firstPageAudio.length > 0);
      }
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!book) return <div className="empty-state">Book not found</div>;

  const handleGenerateAudio = async () => {
    if (!bookId || audioGenerating) return;
    setAudioGenerating(true);
    setAudioProgress("Starting...");
    try {
      const { jobId } = await generateBookAudio(bookId);
      // Poll for completion
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await pollGenerationStatus(jobId);
        setAudioProgress(status.progressMessage || "Generating...");
        if (status.status === "done") {
          setHasAudio(true);
          setAudioProgress("");
          load(); // Reload logs
          break;
        }
        if (status.status === "error" || status.status === "cancelled") {
          setAudioProgress(`Error: ${status.errorMessage || "Failed"}`);
          break;
        }
      }
    } catch (e: any) {
      setAudioProgress(`Error: ${e.message}`);
    } finally {
      setAudioGenerating(false);
    }
  };

  const filteredLogs =
    filter === "all" ? logs : logs.filter((l) => l.step_type === filter);
  const successCount = logs.filter((l) => l.success === 1).length;
  const failCount = logs.filter((l) => l.success === 0).length;
  const totalDuration = logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0);

  return (
    <div className="debug-page">
      <div className="debug-header">
        <div className="debug-nav">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/reader/${bookId}`)}
          >
            ← Reader
          </button>
          <h2>🔍 Debug: {book.title}</h2>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/reader/${bookId}/images`)}
          >
            🖼 All Images
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/create?from=${bookId}`)}
          >
            🔄 Create Variation
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleGenerateAudio}
            disabled={audioGenerating}
          >
            {audioGenerating ? "⏳" : hasAudio ? "🔊 Regenerate Audio" : "🔊 Generate Audio"}
          </button>
          {audioProgress && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {audioProgress}
            </span>
          )}
        </div>

        <div className="debug-summary">
          <span className="debug-stat">
            {logs.length} call{logs.length !== 1 ? "s" : ""}
          </span>
          <span className="debug-stat ok">✓ {successCount}</span>
          {failCount > 0 && (
            <span className="debug-stat err">✗ {failCount}</span>
          )}
          <span className="debug-stat">
            ⏱ {formatDuration(totalDuration)} total
          </span>
        </div>

        <div className="debug-filters">
          {["all", "story", "illustration", "cover", "sound_design", "audio"].map((f) => (
            <button
              key={f}
              className={`debug-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : STEP_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          <p>No generation logs found for this book.</p>
        </div>
      ) : (
        <div className="debug-log-list">
          {filteredLogs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
