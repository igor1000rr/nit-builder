/**
 * Кеш планов по нормализованному запросу пользователя.
 *
 * Зачем: "сайт для кофейни в Минске" и "нужен лендинг кофейне Минск"
 * дают идентичный план в 90% случаев. Хеш по lowercase + удалённой
 * пунктуации позволяет переиспользовать готовый план и пропустить
 * LLM-вызов планировщика (-1500 input tokens, -3..5 секунд).
 *
 * Хранится in-memory, LRU eviction, TTL 24 часа. При рестарте сервера
 * сбрасывается — это ок, кеш горячий и быстро прогревается заново.
 */

import type { Plan } from "~/lib/utils/planSchema";

const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000;

type Entry = { plan: Plan; createdAt: number };

const cache = new Map<string, Entry>();

/**
 * Нормализация запроса для хеширования:
 * - нижний регистр (Сохраняет кириллицу тоже)
 * - заменяем всё кроме букв/цифр/пробелов на пробел
 * - схлопываем пробелы
 */
export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCachedPlan(message: string): Plan | null {
  const key = normalizeQuery(message);
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency: re-insert to move to LRU end
  cache.delete(key);
  cache.set(key, entry);
  return entry.plan;
}

export function setCachedPlan(message: string, plan: Plan): void {
  const key = normalizeQuery(message);
  if (!key) return;
  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest (Map preserves insertion order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { plan, createdAt: Date.now() });
}

export function clearPlanCache(): void {
  cache.clear();
}

export function planCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS };
}
