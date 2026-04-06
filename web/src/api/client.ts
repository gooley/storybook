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
  bookId?: string;
}) =>
  request<{ jobId: string; bookId: string }>("/generate/book", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const pollGenerationStatus = (jobId: string) =>
  request<GenerationStatus>(`/generate/${jobId}/status`);

export const getActiveGenerationJobs = () =>
  request<GenerationStatus[]>("/generate/active");

// Generation logs
export interface GenerationLog {
  id: string;
  job_id: string | null;
  book_id: string | null;
  page_id: string | null;
  step_type: "story" | "illustration" | "cover";
  model: string;
  prompt: string;
  system_prompt: string | null;
  character_refs_json: string | null;
  num_images_attached: number;
  had_reference_image: number;
  response_text: string | null;
  response_model: string | null;
  success: number;
  error_message: string | null;
  duration_ms: number | null;
  created_at: number;
}

export const getBookGenerationLogs = (bookId: string) =>
  request<GenerationLog[]>(`/books/${bookId}/generation-logs`);
