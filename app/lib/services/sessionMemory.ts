/**
 * In-memory session memory. Хранит текущий HTML и историю шагов в рамках сессии.
 * При рестарте сервера сессии сбрасываются — для HTML-first это ок,
 * потому что проекты сохраняются в Appwrite отдельно по projectId.
 */

import type { Plan } from "~/lib/utils/planSchema";

/** Контекст для continuation: когда модель упёрлась в лимит токенов. */
export type TruncationContext = {
  mode: "create" | "polish";
  userMessage: string;
  plan?: Plan;
  templateId?: string;
  /** Сырой HTML который успели сгенерировать до обрыва (без stripCodeFences/repair). */
  partialHtml: string;
  /** Сколько раз уже пытались продолжить. Лимит: MAX_CONTINUATION_ATTEMPTS. */
  attempt: number;
  /** Провайдер который использовался для оборванной генерации (для консистентности при continue). */
  providerId: string;
};

export type SessionMemory = {
  sessionId: string;
  projectId: string;
  currentHtml: string;
  planJson: unknown;
  templateId: string;
  createdAt: number;
  updatedAt: number;
  /** Если установлен — есть оборванная генерация, доступен mode="continue". */
  truncation?: TruncationContext;
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

export function setTruncation(sessionId: string, truncation: TruncationContext): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.truncation = truncation;
    s.updatedAt = Date.now();
  }
}

export function clearTruncation(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.truncation = undefined;
    s.updatedAt = Date.now();
  }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000);

if (typeof process !== "undefined") {
  process.on?.("SIGTERM", () => clearInterval(cleanupTimer));
  process.on?.("SIGINT", () => clearInterval(cleanupTimer));
}
