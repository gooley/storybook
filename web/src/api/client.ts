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
export const getBook = (id: string) => request<Book>(`/books/${id}`);
export const getBookPages = (id: string) => request<Page[]>(`/books/${id}/pages`);
export const getBookCoverUrl = (id: string) => `${BASE}/books/${id}/cover`;
export const getPageImageUrl = (pageId: string) => `${BASE}/books/pages/${pageId}/image`;
