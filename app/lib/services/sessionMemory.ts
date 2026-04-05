/**
 * In-memory session memory. Хранит текущий HTML и историю шагов в рамках сессии.
 * При рестарте сервера сессии сбрасываются — для HTML-first это ок,
 * потому что проекты сохраняются в Appwrite отдельно по projectId.
 */

export type SessionMemory = {
  sessionId: string;
  projectId: string;
  currentHtml: string;
  planJson: unknown;
  templateId: string;
  createdAt: number;
  updatedAt: number;
};

const sessions = new Map<string, SessionMemory>();
const MAX_SESSIONS = 10_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getOrCreateSession(sessionId: string, projectId: string): SessionMemory {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  if (sessions.size >= MAX_SESSIONS) {
    // evict oldest
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }

  const fresh: SessionMemory = {
    sessionId,
    projectId,
    currentHtml: "",
    planJson: null,
    templateId: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.set(sessionId, fresh);
  return fresh;
}

export function getSession(sessionId: string): SessionMemory | undefined {
  return sessions.get(sessionId);
}

export function updateSessionHtml(sessionId: string, html: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.currentHtml = html;
    s.updatedAt = Date.now();
  }
}

// Periodic cleanup
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000);

// For graceful shutdown
if (typeof process !== "undefined") {
  process.on?.("SIGTERM", () => clearInterval(cleanupTimer));
  process.on?.("SIGINT", () => clearInterval(cleanupTimer));
}
