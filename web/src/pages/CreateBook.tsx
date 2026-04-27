import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getCharacters,
  getCharacterPhotoUrl,
  getLocations,
  getLocationPhotoUrl,
  getPageImageUrl,
  startGeneration,
  pollGenerationStatus,
  getAvailableModels,
  getBookGenerationParams,
  uploadElementPhotos,
  type Character,
  type LocationWithPhotos,
  type GenerationStatus,
  type ModelLists,
} from "../api/client";
import { ModelSelector } from "../components/ModelSelector";
import { PhotoSourcePicker } from "../components/PhotoSourcePicker";

const PAGE_COUNT_OPTIONS = [2, 4, 8];
const ADVANCED_PROMPT_MAX_LENGTH = 50000;
const POLL_INTERVAL_FAST = 2000;
const POLL_INTERVAL_SLOW = 5000;
const SLOW_THRESHOLD_MS = 30000;

const THEME_OPTIONS = [
  { id: "none", label: "No theme" },
  { id: "making-a-friend", label: "Making a new friend" },
  { id: "learning-something-new", label: "Learning to do something new" },
  { id: "first-day-of-school", label: "First day of school" },
  { id: "being-independent", label: "Learning to be independent" },
  { id: "overcoming-fear", label: "Overcoming a fear" },
  { id: "helping-others", label: "Helping others" },
  { id: "sharing-and-kindness", label: "Sharing and kindness" },
  { id: "big-adventure", label: "Going on a big adventure" },
  { id: "believing-in-yourself", label: "Believing in yourself" },
  { id: "trying-after-failing", label: "Trying again after failing" },
  { id: "custom", label: "Custom theme…" },
];

const LEADING_ARTICLES = new Set(["a", "an", "the"]);

type NamedEntity = {
  id: string;
  name: string;
};

type StoryMode = "auto" | "standard" | "advanced";

function getAdvancedPromptPageCount(prompt: string) {
  const matches = Array.from(prompt.matchAll(/^\s*Page\s+(\d+)\s*$/gim));
  const pages = new Set(matches.map((match) => Number.parseInt(match[1], 10)));
  return pages.size;
}

function detectAdvancedPrompt(prompt: string) {
  return (
    getAdvancedPromptPageCount(prompt) >= 2 &&
    /^\s*Text\s*$/im.test(prompt) &&
    /^\s*Illustration notes\s*$/im.test(prompt)
  );
}

function tokenizeForEntityMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g) ?? [];
}

function stripLeadingArticles(words: string[]) {
  let firstContentWord = 0;
  while (firstContentWord < words.length && LEADING_ARTICLES.has(words[firstContentWord])) {
    firstContentWord += 1;
  }
  return words.slice(firstContentWord);
}

function entityNameVariants(name: string) {
  const words = tokenizeForEntityMatch(name);
  const variants = [words, stripLeadingArticles(words)];
  const seen = new Set<string>();

  return variants.filter((variant) => {
    if (variant.length === 0) return false;
    const key = variant.join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function promptContainsEntity(promptWords: string[], entityWords: string[]) {
  const spacedEntity = entityWords.join(" ");
  const compactEntity = entityWords.join("");

  for (let start = 0; start < promptWords.length; start += 1) {
    const sameWordCount = promptWords.slice(start, start + entityWords.length);
    if (sameWordCount.join(" ") === spacedEntity) return true;

    let compactPrompt = "";
    for (let end = start; end < promptWords.length; end += 1) {
      compactPrompt += promptWords[end];
      if (compactPrompt === compactEntity) return true;
      if (compactPrompt.length >= compactEntity.length) break;
    }
  }

  return false;
}

function getMatchingEntityIds(prompt: string, entities: NamedEntity[]) {
  const promptWords = tokenizeForEntityMatch(prompt);
  if (promptWords.length === 0) return [];

  return entities
    .filter((entity) =>
      entityNameVariants(entity.name).some((variant) => promptContainsEntity(promptWords, variant))
    )
    .map((entity) => entity.id);
}

function addIdsToSelection(selectedIds: Set<string>, idsToAdd: string[]) {
  let nextSelectedIds: Set<string> | null = null;
  for (const id of idsToAdd) {
    if (!selectedIds.has(id)) {
      nextSelectedIds ??= new Set(selectedIds);
      nextSelectedIds.add(id);
    }
  }
  return nextSelectedIds ?? selectedIds;
}

function pruneDismissedIds(dismissedIds: Set<string>, matchingIds: string[]) {
  const matchingIdSet = new Set(matchingIds);
  for (const id of Array.from(dismissedIds)) {
    if (!matchingIdSet.has(id)) dismissedIds.delete(id);
  }
}

function excludeDismissedIds(matchingIds: string[], dismissedIds: Set<string>) {
  return matchingIds.filter((id) => !dismissedIds.has(id));
}

function updateDismissedId(
  dismissedIds: Set<string>,
  prompt: string,
  entity: NamedEntity | undefined,
  wasSelected: boolean
) {
  if (!entity) return;
  if (wasSelected && getMatchingEntityIds(prompt, [entity]).length > 0) {
    dismissedIds.add(entity.id);
  } else {
    dismissedIds.delete(entity.id);
  }
}

export function CreateBook() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromBookId = searchParams.get("from");

  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState(4);
  const [storyMode, setStoryMode] = useState<StoryMode>("auto");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<LocationWithPhotos[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [elementFiles, setElementFiles] = useState<File[]>([]);
  const [elementPreviews, setElementPreviews] = useState<string[]>([]);
  const [theme, setTheme] = useState("none");
  const [customTheme, setCustomTheme] = useState("");
  const [loading, setLoading] = useState(true);
  const [variationTitle, setVariationTitle] = useState<string | null>(null);

  // Audio toggle
  const [generateAudio, setGenerateAudio] = useState(true);

  // Model settings
  const [modelLists, setModelLists] = useState<ModelLists | null>(null);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [storyModel, setStoryModel] = useState("");
  const [illustrationModel, setIllustrationModel] = useState("");
  const [coverModel, setCoverModel] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const dismissedCharacterIdsRef = useRef<Set<string>>(new Set());
  const dismissedLocationIdsRef = useRef<Set<string>>(new Set());

  const loadCharacters = useCallback(async () => {
    try {
      const [chars, locs] = await Promise.all([getCharacters(), getLocations()]);
      setCharacters(chars);
      setLocations(locs);
      const defaultIds = new Set(chars.filter((c) => c.include_by_default).map((c) => c.id));
      setSelectedIds(defaultIds);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load models list
  useEffect(() => {
    getAvailableModels().then((models) => {
      setModelLists(models);
      setStoryModel(models.defaults.story);
      setIllustrationModel(models.defaults.illustration);
      setCoverModel(models.defaults.cover);
    }).catch(console.error);
  }, []);

  // Load pre-fill params if creating a variation
  useEffect(() => {
    if (!fromBookId) return;
    getBookGenerationParams(fromBookId).then((params) => {
      setDescription(params.description);
      setPageCount(params.pageCount);
      if (params.storyMode) setStoryMode(params.storyMode);
      setSelectedIds(new Set(params.characterIds));
      setSelectedLocationIds(new Set(params.locationIds || []));
      setVariationTitle(params.title);
      if (params.storyModel) setStoryModel(params.storyModel);
      if (params.illustrationModel) setIllustrationModel(params.illustrationModel);
      if (params.coverModel) setCoverModel(params.coverModel);
      if (params.generateAudio !== undefined) setGenerateAudio(params.generateAudio);
      if (params.theme) setTheme(params.theme);
      if (params.customTheme) setCustomTheme(params.customTheme);
    }).catch(console.error);
  }, [fromBookId]);

  useEffect(() => {
    loadCharacters();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadCharacters]);

  useEffect(() => {
    const matchingCharacterIds = getMatchingEntityIds(description, characters);
    const matchingLocationIds = getMatchingEntityIds(description, locations);
    pruneDismissedIds(dismissedCharacterIdsRef.current, matchingCharacterIds);
    pruneDismissedIds(dismissedLocationIdsRef.current, matchingLocationIds);

    const selectableCharacterIds = excludeDismissedIds(
      matchingCharacterIds,
      dismissedCharacterIdsRef.current
    );
    const selectableLocationIds = excludeDismissedIds(
      matchingLocationIds,
      dismissedLocationIdsRef.current
    );

    if (selectableCharacterIds.length > 0) {
      setSelectedIds((prev) => addIdsToSelection(prev, selectableCharacterIds));
    }
    if (selectableLocationIds.length > 0) {
      setSelectedLocationIds((prev) => addIdsToSelection(prev, selectableLocationIds));
    }
  }, [description, characters, locations]);

  const toggleCharacter = (id: string) => {
    updateDismissedId(
      dismissedCharacterIdsRef.current,
      description,
      characters.find((c) => c.id === id),
      selectedIds.has(id)
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLocation = (id: string) => {
    updateDismissedId(
      dismissedLocationIdsRef.current,
      description,
      locations.find((loc) => loc.id === id),
      selectedLocationIds.has(id)
    );
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleElementPhotos = (files: File[]) => {
    const maxNew = 5 - elementFiles.length;
    const toAdd = files.slice(0, maxNew);
    if (toAdd.length === 0) return;

    setElementFiles((prev) => [...prev, ...toAdd]);

    for (const file of toAdd) {
      const url = URL.createObjectURL(file);
      setElementPreviews((prev) => [...prev, url]);
    }
  };

  const removeElementPhoto = (index: number) => {
    URL.revokeObjectURL(elementPreviews[index]);
    setElementFiles((prev) => prev.filter((_, i) => i !== index));
    setElementPreviews((prev) => prev.filter((_, i) => i !== index));
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

    // Only send model overrides if they differ from defaults
    const modelOverrides: Record<string, string> = {};
    if (modelLists) {
      if (storyModel && storyModel !== modelLists.defaults.story) {
        modelOverrides.storyModel = storyModel;
      }
      if (illustrationModel && illustrationModel !== modelLists.defaults.illustration) {
        modelOverrides.illustrationModel = illustrationModel;
      }
      if (coverModel && coverModel !== modelLists.defaults.cover) {
        modelOverrides.coverModel = coverModel;
      }
    }

    try {
      // Upload element photos if any
      let elementPhotoPaths: string[] = [];
      if (elementFiles.length > 0) {
        const uploadResult = await uploadElementPhotos(elementFiles);
        elementPhotoPaths = uploadResult.photos.map((p) => p.path);
      }

      const result = await startGeneration({
        description: description.trim(),
        pageCount,
        storyMode,
        characterIds: Array.from(selectedIds),
        locationIds: Array.from(selectedLocationIds),
        elementPhotoPaths,
        generateAudio,
        theme: theme !== "none" ? theme : undefined,
        customTheme: theme === "custom" ? customTheme.trim() : undefined,
        ...modelOverrides,
      });
      startPolling(result.jobId, result.bookId);
    } catch (e: any) {
      setError(e.message || "Failed to start generation");
      setGenerating(false);
    }
  };

  const hasNonDefaultModels = modelLists && (
    storyModel !== modelLists.defaults.story ||
    illustrationModel !== modelLists.defaults.illustration ||
    coverModel !== modelLists.defaults.cover
  );
  const detectedAdvancedPrompt = detectAdvancedPrompt(description);
  const detectedAdvancedPageCount = getAdvancedPromptPageCount(description);
  const usingAdvancedMode =
    storyMode === "advanced" || (storyMode === "auto" && detectedAdvancedPrompt);

  const familyChars = characters.filter((c) => c.type === "family");
  const friendChars = characters.filter((c) => c.type === "friend");

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div className="create-page">
      <div className="page-header">
        <h2>{fromBookId ? "🔄 Create Variation" : "✨ Create a Story"}</h2>
      </div>

      {variationTitle && (
        <div className="variation-banner">
          Based on: <strong>{variationTitle}</strong> — tweak settings and generate a new version
        </div>
      )}

      {!generating ? (
        <div className="create-form">
          <div className="form-group">
            <label>What's the story about?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                usingAdvancedMode
                  ? "Paste a full page-by-page story with Page 1, Text, and Illustration notes sections..."
                  : "Dana goes on an adventure to find a magical forest where animals can talk…"
              }
              rows={usingAdvancedMode ? 16 : 4}
              maxLength={ADVANCED_PROMPT_MAX_LENGTH}
            />
            {detectedAdvancedPrompt && (
              <p className="form-hint">
                Advanced prompt detected: {detectedAdvancedPageCount} pages. Page text will be used exactly as written.
              </p>
            )}
            {storyMode === "advanced" && !detectedAdvancedPrompt && (
              <p className="form-hint">
                Advanced prompts should include Page N sections with Text and Illustration notes headings.
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Story mode</label>
            <div className="theme-options">
              {[
                { id: "auto", label: "Auto-detect" },
                { id: "standard", label: "Standard" },
                { id: "advanced", label: "Advanced" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  className={`theme-btn ${storyMode === mode.id ? "active" : ""}`}
                  onClick={() => setStoryMode(mode.id as StoryMode)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="form-hint">
              Advanced mode accepts exact page text and per-page illustration notes with any supported page count.
            </p>
          </div>

          <div className="form-group">
            <label>Theme</label>
            <div className="theme-options">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  className={`theme-btn ${theme === t.id ? "active" : ""}`}
                  onClick={() => setTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {theme === "custom" && (
              <input
                type="text"
                className="custom-theme-input"
                value={customTheme}
                onChange={(e) => setCustomTheme(e.target.value)}
                placeholder="Describe your theme…"
                maxLength={200}
              />
            )}
          </div>

          <div className="form-group">
            {usingAdvancedMode ? (
              <>
                <label>Number of pages</label>
                <p className="form-hint">
                  The server will derive the page count from your Page sections
                  {detectedAdvancedPageCount > 0 ? ` (${detectedAdvancedPageCount} detected).` : "."}
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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

          {locations.length > 0 && (
            <div className="form-group">
              <label>Locations</label>
              <div className="character-picker">
                <div className="character-chips">
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      className={`character-chip ${selectedLocationIds.has(loc.id) ? "selected" : ""}`}
                      onClick={() => toggleLocation(loc.id)}
                    >
                      {loc.photos.length > 0 && (
                        <img
                          src={getLocationPhotoUrl(loc.id, loc.photos[0].id)}
                          alt={loc.name}
                          className="chip-photo"
                        />
                      )}
                      <span>{loc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Element Photos */}
          <div className="form-group">
            <label>Element Photos</label>
            <p className="form-hint">Attach photos of items or details to include in the illustrations</p>
            <div className="element-photos">
              {elementPreviews.map((url, i) => (
                <div key={i} className="element-photo-thumb">
                  <img src={url} alt={`Element ${i + 1}`} />
                  <button
                    className="element-photo-remove"
                    onClick={() => removeElementPhoto(i)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
              {elementFiles.length < 5 && (
                <PhotoSourcePicker onFiles={handleElementPhotos} multiple>
                  <div className="element-photo-add">
                    <span>+</span>
                  </div>
                </PhotoSourcePicker>
              )}
            </div>
          </div>

          {/* Audio Toggle */}
          <div className="form-group">
            <label
              className="toggle-row"
              onClick={() => setGenerateAudio(!generateAudio)}
            >
              <span>🔊 Generate Audio</span>
              <span className={`toggle-switch ${generateAudio ? "on" : ""}`}>
                <span className="toggle-knob" />
              </span>
            </label>
            <p className="form-hint">Generate up to two reusable ambient loops and two story-highlight sound effects</p>
          </div>

          {/* Model Settings */}
          {modelLists && (
            <div className="form-group">
              <button
                className="model-settings-toggle"
                onClick={() => setShowModelSettings(!showModelSettings)}
              >
                ⚙️ Model Settings
                {hasNonDefaultModels && <span className="model-settings-badge">customized</span>}
                <span className={`toggle-arrow ${showModelSettings ? "open" : ""}`}>▸</span>
              </button>

              {showModelSettings && (
                <div className="model-settings-panel">
                  <ModelSelector
                    label="Story"
                    options={modelLists.story}
                    value={storyModel}
                    onChange={setStoryModel}
                  />
                  <ModelSelector
                    label="Illustrations"
                    options={modelLists.illustration}
                    value={illustrationModel}
                    onChange={setIllustrationModel}
                  />
                  <ModelSelector
                    label="Cover"
                    options={modelLists.cover}
                    value={coverModel}
                    onChange={setCoverModel}
                  />
                </div>
              )}
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button
            className="btn btn-primary generate-btn"
            onClick={handleGenerate}
            disabled={!description.trim()}
          >
            {fromBookId ? "🔄 Generate Variation" : "✨ Generate Story"}
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
