/**
 * Cross-encoder reranker для RAG. Второй этап поиска:
 *   1. Cosine similarity отбирает top-N кандидатов (дешёвый, быстрый, но шумный)
 *   2. Cross-encoder перевзвешивает их (дороже но точнее для финального выбора)
 *
 * Отличие от bi-encoder (embedding):
 *   - Bi-encoder эмбеддит query и doc НЕЗАВИСИМО, потом сравнивает cosine.
 *     Быстро (кэшируется), но теряет нюансы interaction между текстами.
 *   - Cross-encoder подаёт (query, doc) ПАРОЙ в модель, выдаёт relevance score 0..1.
 *     Медленнее (~30-100ms на пару на локальной GPU), но ловит семантику.
 *
 * Бенчмарки (Anthropic Contextual Retrieval, late 2024):
 *   - cosine только:                       baseline
 *   - cosine + cross-encoder rerank:        +18-49% recallЀ1
 *   - contextual + cosine + rerank:         +67% recallЀ1 накопительно
 *
 * Наш стек:
 *   - bge-reranker-v2-m3 — мультиязычный (RU+EN+ещё 100), 568M, ~1.2GB в RAM,
 *     работает рядом с Qwen2.5-Coder-7B без проблем
 *   - LM Studio 0.3.10+ поддерживает reranker models через отдельный endpoint
 *     /v1/rerank (и также через обычный OpenAI rerank API)
 *
 * Graceful degradation встроена:
 *   - если reranker не доступен — disabled=true до рестарта, fallback на cosine-only
 *   - ENV NIT_RERANKER_ENABLED=0 — жёсткий kill-switch
 *   - отдельный от NIT_RAG_ENABLED — реранкер можно выключить, оставив cosine RAG
 *
 * Кэш реранков: Map<query+docId → score>, 1000 записей, FIFO eviction.
 * Кэш осмыслен потому что seed-документы стабильны, а typical user-queries повторяются.
 */

import { logger } from "~/lib/utils/logger";

const SCOPE = "ragReranker";
const LMSTUDIO_BASE = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
const RERANK_MODEL = process.env.LMSTUDIO_RERANK_MODEL ?? "bge-reranker-v2-m3";
const MAX_DOC_LEN = 2000;
const MAX_CACHE = 1000;
const DEFAULT_TIMEOUT_MS = 5000;

let disabled = false;
const cache = new Map<string, number>();

export function isRerankerDisabled(): boolean {
  if (process.env.NIT_RERANKER_ENABLED === "0") return true;
  return disabled;
}

export function resetRerankerState(): void {
  disabled = false;
  cache.clear();
}

function cacheKey(query: string, docId: string): string {
  // Док-ид вовлечён в ключ, но не сам текст — для seed доков (стабильных)
  // этого достаточно. Для mutable docs нужно будет версионировать id.
  const q = query.length > 200 ? query.slice(0, 200) : query;
  return `${q}\u0001${docId}`;
}

function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", () => controller.abort(), { once: true });
  }
  // Очистка таймера не критична — fetch отменится сам по результату
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export type RerankCandidate = {
  /** Стабильный id (для кэша). */
  id: string;
  /** Текст который попадёт в пару (query, doc). */
  text: string;
};

export type RerankResult = {
  id: string;
  /** Relevance score 0..1 от cross-encoder. */
  score: number;
};

/**
 * Вызывает LM Studio rerank endpoint, возвращает scores в том же порядке
 * что входные candidates. НЕ сортирует — это делает вызывающий.
 *
 * Кэш проверяется попарно: если все пары в кэше — HTTP вызов не делается.
 * Если часть в кэше — запрашиваются только missing пары.
 */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  signal?: AbortSignal,
): Promise<RerankResult[] | null> {
  if (isRerankerDisabled()) return null;
  if (!query.trim() || candidates.length === 0) return [];

  // Проверяем кэш для каждого кандидата
  const cached: Map<string, number> = new Map();
  const missing: RerankCandidate[] = [];
  for (const c of candidates) {
    const key = cacheKey(query, c.id);
    const score = cache.get(key);
    if (score !== undefined) cached.set(c.id, score);
    else missing.push(c);
  }

  if (missing.length === 0) {
    return candidates.map((c) => ({ id: c.id, score: cached.get(c.id) ?? 0 }));
  }

  try {
    const documents = missing.map((c) => c.text.slice(0, MAX_DOC_LEN));
    const requestSignal = timeoutSignal(DEFAULT_TIMEOUT_MS, signal);

    const res = await fetch(`${LMSTUDIO_BASE}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        // return_documents=false экономит трафик; top_n не ставим — хотим все scores
        return_documents: false,
      }),
      signal: requestSignal,
    });
    if (!res.ok) throw new Error(`Rerank HTTP ${res.status}`);

    const data = (await res.json()) as {
      results?: Array<{ index: number; relevance_score?: number; score?: number }>;
    };
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid rerank response shape");
    }

    // Собираем scores по indices (в missing-массиве)
    const newScores = new Map<string, number>();
    for (const r of data.results) {
      const cand = missing[r.index];
      if (!cand) continue;
      const score = r.relevance_score ?? r.score ?? 0;
      newScores.set(cand.id, score);
      // Пишем в кэш
      if (cache.size >= MAX_CACHE) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(cacheKey(query, cand.id), score);
    }

    // Возвращаем в исходном порядке candidates (смешанные cached + new)
    const result: RerankResult[] = candidates.map((c) => ({
      id: c.id,
      score: cached.get(c.id) ?? newScores.get(c.id) ?? 0,
    }));

    logger.info(
      SCOPE,
      `Reranked ${candidates.length} candidates (${cached.size} cached, ${missing.length} fresh)`,
    );
    return result;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      // Подхватываем и timeout, и user abort
      // Timeout — реранкер подвис, не блокируем остальные запросы сессии
      const isUserAbort = signal?.aborted ?? false;
      if (isUserAbort) throw err;
      logger.warn(SCOPE, `Rerank timeout >${DEFAULT_TIMEOUT_MS}ms, fallback to cosine`);
      return null;
    }
    logger.warn(
      SCOPE,
      `Rerank failed (${(err as Error).message}), disabling for this session`,
    );
    disabled = true;
    return null;
  }
}
