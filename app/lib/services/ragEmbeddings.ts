/**
 * Обёртка над LM Studio /v1/embeddings для RAG. Graceful degradation:
 * при первом фейле disabled=true до рестарта процесса, RAG-модули
 * возвращают пусто, пайплайн работает без few-shot как раньше.
 *
 * Конфиг:
 *   LMSTUDIO_BASE_URL              (default http://localhost:1234/v1)
 *   LMSTUDIO_EMBEDDING_MODEL       (default text-embedding-nomic-embed-text-v1.5)
 *   NIT_RAG_ENABLED=0              жёсткое отключение RAG
 *   NIT_EMBEDDING_DIMS             (опц., default — full dim) Matryoshka slicing
 *   NIT_EMBEDDING_QUERY_PREFIX     (опц., default "") asymmetric model query side
 *   NIT_EMBEDDING_PASSAGE_PREFIX   (опц., default "") asymmetric model doc side
 *
 * Префиксы query/passage нужны для asymmetric моделей (e5, jina-v3, bge-m3),
 * которые обучены отличать индексируемый passage от query. Для symmetric
 * моделей (nomic) префиксы остаются пустыми — поведение как раньше.
 *
 * Примеры ENV:
 *   # multilingual-e5-large:
 *   LMSTUDIO_EMBEDDING_MODEL=multilingual-e5-large
 *   NIT_EMBEDDING_QUERY_PREFIX="query: "
 *   NIT_EMBEDDING_PASSAGE_PREFIX="passage: "
 *
 *   # bge-m3:
 *   LMSTUDIO_EMBEDDING_MODEL=bge-m3
 *   NIT_EMBEDDING_QUERY_PREFIX="" NIT_EMBEDDING_PASSAGE_PREFIX=""  # symmetric
 */

import { logger } from "~/lib/utils/logger";

const SCOPE = "ragEmbeddings";
const LMSTUDIO_BASE = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
const EMBED_MODEL =
  process.env.LMSTUDIO_EMBEDDING_MODEL ?? "text-embedding-nomic-embed-text-v1.5";
const MAX_TEXT_LEN = 4000;
const MAX_CACHE = 2000;

export type EmbeddingKind = "query" | "passage";

let disabled = false;
const cache = new Map<string, number[]>();

function cacheKey(text: string, kind: EmbeddingKind | "none"): string {
  // Кеш-ключ включает размерность и kind — иначе при изменении ENV
  // летят векторы от прошлой конфигурации.
  const dims = getTargetEmbeddingDims() ?? "full";
  const base = text.length > 200 ? `${text.length}:${text.slice(0, 200)}` : text;
  return `d${dims}:k${kind}:${base}`;
}

export function isRagDisabled(): boolean {
  if (process.env.NIT_RAG_ENABLED === "0") return true;
  return disabled;
}

export function getTargetEmbeddingDims(): number | null {
  const raw = process.env.NIT_EMBEDDING_DIMS;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Префикс для конкретного кинда. Пустой = не применять (symmetric модель).
 */
export function getEmbeddingPrefix(kind: EmbeddingKind): string {
  if (kind === "query") return process.env.NIT_EMBEDDING_QUERY_PREFIX ?? "";
  return process.env.NIT_EMBEDDING_PASSAGE_PREFIX ?? "";
}

/**
 * Приклеивает префикс к тексту. Идемпотентно: если префикс уже есть — не дублирует.
 * Используется templateRetriever и любыми другими модулями которые обходят embedText
 * (например идут напрямую в ai SDK embed/embedMany).
 */
export function applyEmbeddingPrefix(text: string, kind: EmbeddingKind): string {
  const prefix = getEmbeddingPrefix(kind);
  if (!prefix) return text;
  if (text.startsWith(prefix)) return text;
  return prefix + text;
}

/**
 * Matryoshka slicing + L2-renormalize.
 */
export function truncateAndRenormalize(vec: number[], targetDims: number): number[] {
  if (vec.length <= targetDims) return vec;
  const sliced = vec.slice(0, targetDims);
  let sumSquares = 0;
  for (let i = 0; i < sliced.length; i++) {
    const v = sliced[i]!;
    sumSquares += v * v;
  }
  if (sumSquares === 0) return sliced;
  const norm = Math.sqrt(sumSquares);
  for (let i = 0; i < sliced.length; i++) {
    sliced[i] = sliced[i]! / norm;
  }
  return sliced;
}

export async function embedText(
  text: string,
  signal?: AbortSignal,
  opts: { kind?: EmbeddingKind } = {},
): Promise<number[] | null> {
  if (isRagDisabled()) return null;
  if (!text.trim()) return null;

  const kind = opts.kind ?? "none";
  const prefixed = kind !== "none" ? applyEmbeddingPrefix(text, kind) : text;
  const key = cacheKey(prefixed, kind);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(`${LMSTUDIO_BASE}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: prefixed.slice(0, MAX_TEXT_LEN),
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const rawVec = data.data?.[0]?.embedding;
    if (!rawVec || rawVec.length === 0) throw new Error("Empty embedding");

    const targetDims = getTargetEmbeddingDims();
    const vec =
      targetDims && rawVec.length > targetDims
        ? truncateAndRenormalize(rawVec, targetDims)
        : rawVec;

    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, vec);
    return vec;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(
      SCOPE,
      `Embedding failed (${(err as Error).message}), disabling RAG for this session`,
    );
    disabled = true;
    return null;
  }
}

export function resetEmbeddingState(): void {
  disabled = false;
  cache.clear();
}
