const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Character {
  id: string;
  name: string;
  type: "family" | "friend";
  notes: string;
  photo_path: string | null;
  include_by_default: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface Book {
  id: string;
  title: string;
  description: string;
  cover_image_path: string | null;
  status: string;
  hidden: number;
  has_audio: number;
  created_at: number;
  updated_at: number;
  page_count?: number;
}

export interface Page {
  id: string;
  book_id: string;
  page_number: number;
  text: string;
  image_path: string | null;
  image_status: string;
}

export interface GenerationStatus {
  id: string;
  status: string;
  bookId: string | null;
  progressMessage: string | null;
  progressFraction: number;
  completedSteps: number;
  totalSteps: number;
  firstIllustrationReady: boolean;
  completedPageIds: string[];
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export const getCharacters = () => request<Character[]>("/characters");
export const createCharacter = (data: Partial<Character>) =>
  request<Character>("/characters", { method: "POST", body: JSON.stringify(data) });
export const updateCharacter = (id: string, data: Partial<Character>) =>
  request<Character>(`/characters/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCharacter = (id: string) =>
  request<void>(`/characters/${id}`, { method: "DELETE" });

export async function uploadCharacterPhoto(id: string, file: File): Promise<{ photo_path: string }> {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch(`${BASE}/characters/${id}/photo`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export const getCharacterPhotoUrl = (id: string) => `${BASE}/characters/${id}/photo`;

// Locations API
export interface Location {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface LocationPhoto {
  id: string;
  location_id: string;
  photo_path: string;
  sort_order: number;
  created_at: number;
}

export interface LocationWithPhotos extends Location {
  photos: LocationPhoto[];
}

export const getLocations = () => request<LocationWithPhotos[]>("/locations");
export const createLocation = (data: { name: string; description?: string }) =>
  request<Location>("/locations", { method: "POST", body: JSON.stringify(data) });
export const updateLocation = (id: string, data: { name?: string; description?: string }) =>
  request<Location>(`/locations/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteLocation = (id: string) =>
  request<void>(`/locations/${id}`, { method: "DELETE" });

export async function uploadLocationPhoto(locationId: string, file: File): Promise<LocationPhoto> {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch(`${BASE}/locations/${locationId}/photos`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed: ${body}`);
  }
  return res.json();
}

export const deleteLocationPhoto = (locationId: string, photoId: string) =>
  request<void>(`/locations/${locationId}/photos/${photoId}`, { method: "DELETE" });

export const getLocationPhotoUrl = (locationId: string, photoId: string) =>
  `${BASE}/locations/${locationId}/photos/${photoId}`;

// Element Photos API (per-story uploads)
export async function uploadElementPhotos(files: File[]): Promise<{ photos: { path: string }[] }> {
  const form = new FormData();
  for (const file of files) {
    form.append("photos", file);
  }
  const res = await fetch(`${BASE}/generate/element-photos`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed: ${body}`);
  }
  return res.json();
}

export const getBooks = () => request<Book[]>("/books");
export const updateBook = (id: string, data: Partial<Book>) =>
  request<Book>(`/books/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const getBook = (id: string) => request<Book>(`/books/${id}`);
export const getBookPages = (id: string) => request<Page[]>(`/books/${id}/pages`);
export const getBookCoverUrl = (id: string) => `${BASE}/books/${id}/cover`;
export const getPageImageUrl = (pageId: string) => `${BASE}/books/pages/${pageId}/image`;

// Generation API
export const startGeneration = (data: {
  description: string;
  pageCount: number;
  characterIds: string[];
  locationIds: string[];
  elementPhotoPaths?: string[];
  bookId?: string;
  storyModel?: string;
  illustrationModel?: string;
  coverModel?: string;
  generateAudio?: boolean;
  theme?: string;
  customTheme?: string;
  illustrationStyle?: string;
}) =>
  request<{ jobId: string; bookId: string }>("/generate/book", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const pollGenerationStatus = (jobId: string) =>
  request<GenerationStatus>(`/generate/${jobId}/status`);

export const getActiveGenerationJobs = () =>
  request<GenerationStatus[]>("/generate/active");

export const generateBookAudio = (bookId: string) =>
  request<{ jobId: string; bookId: string }>(`/generate/${bookId}/generate-audio`, {
    method: "POST",
  });

// Models API
export interface ModelOption {
  id: string;
  name: string;
  isDefault: boolean;
  compatibility: "tested" | "experimental";
}

export interface ModelLists {
  story: ModelOption[];
  illustration: ModelOption[];
  cover: ModelOption[];
  defaults: { story: string; illustration: string; cover: string };
}

export const getAvailableModels = () => request<ModelLists>("/models");

// Generation params (for "create variation" flow)
export interface GenerationParams {
  description: string;
  pageCount: number;
  characterIds: string[];
  locationIds: string[];
  title: string;
  storyModel: string | null;
  illustrationModel: string | null;
  coverModel: string | null;
  generateAudio?: boolean;
  theme?: string;
  customTheme?: string;
  illustrationStyle?: string | null;
}

export const getBookGenerationParams = (bookId: string) =>
  request<GenerationParams>(`/books/${bookId}/generation-params`);

// Generation logs
export interface GenerationLog {
  id: string;
  job_id: string | null;
  book_id: string | null;
  page_id: string | null;
  step_type: "story" | "illustration" | "cover" | "sound_design" | "audio";
  model: string;
  prompt: string;
  system_prompt: string | null;
  character_refs_json: string | null;
  num_images_attached: number;
  had_reference_image: number;
  response_text: string | null;
  response_model: string | null;
  input_image_paths_json: string | null;
  output_image_path: string | null;
  success: number;
  error_message: string | null;
  duration_ms: number | null;
  created_at: number;
}

export const getBookGenerationLogs = (bookId: string) =>
  request<GenerationLog[]>(`/books/${bookId}/generation-logs`);

export const getUploadUrl = (relativePath: string) =>
  `${BASE}/books/uploads/${relativePath}`;

// Audio API
export interface PageAudio {
  id: string;
  page_id: string;
  audio_type: "ambient" | "sfx";
  description: string;
  audio_path: string | null;
  duration_seconds: number | null;
  sort_order: number;
  status: string;
}

export const getPageAudio = (pageId: string) =>
  request<PageAudio[]>(`/books/pages/${pageId}/audio`);
export const getAudioFileUrl = (audioId: string) => `${BASE}/books/audio/${audioId}`;
