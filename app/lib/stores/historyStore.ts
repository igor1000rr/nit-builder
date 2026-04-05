/**
 * Client-only history of generated sites. Stored in localStorage.
 * v1.0 простая версия — сохраняем последние 20 генераций прямо в браузере.
 * В v1.2 заменим на Appwrite с реальной "Мои сайты" страницей.
 */

export type HistoryEntry = {
  id: string;
  prompt: string;
  html: string;
  templateId: string;
  templateName: string;
  createdAt: number;
  thumbnail?: string; // data:image/svg (optional)
};

const STORAGE_KEY = "nit:history";
const MAX_ENTRIES = 20;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadHistory(): HistoryEntry[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry {
  if (!isClient()) {
    return { id: "ssr", createdAt: Date.now(), ...entry };
  }

  const full: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    ...entry,
  };

  const current = loadHistory();
  const updated = [full, ...current].slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    // Storage quota exceeded — drop oldest entries and retry
    console.warn("[history] storage full, dropping oldest", err);
    const trimmed = updated.slice(0, 10);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Still failing — give up silently
    }
  }

  return full;
}

export function deleteFromHistory(id: string): HistoryEntry[] {
  if (!isClient()) return [];
  const current = loadHistory();
  const updated = current.filter((h) => h.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearHistory(): void {
  if (!isClient()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getHistoryById(id: string): HistoryEntry | null {
  return loadHistory().find((h) => h.id === id) ?? null;
}
