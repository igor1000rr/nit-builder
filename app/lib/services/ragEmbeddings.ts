/**
 * Обёртка над LM Studio /v1/embeddings для RAG. Graceful degradation:
 * при первом фейле disabled=true до рестарта процесса, RAG-модули
 * возвращают пусто, пайплайн работает без few-shot как раньше.
 *
 * Конфиг:
 *   LMSTUDIO_BASE_URL           (default http://localhost:1234/v1)
 *   LMSTUDIO_EMBEDDING_MODEL    (default text-embedding-nomic-embed-text-v1.5)
 *   NIT_RAG_ENABLED=0           жёсткое отключение RAG
 */

import { logger } from "~/lib/utils/logger";

const SCOPE = "ragEmbeddings";
const LMSTUDIO_BASE = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
const EMBED_MODEL =
  process.env.LMSTUDIO_EMBEDDING_MODEL ?? "text-embedding-nomic-embed-text-v1.5";
const MAX_TEXT_LEN = 4000;
const MAX_CACHE = 2000;

let disabled = false;
const cache = new Map<string, number[]>();

function cacheKey(text: string): string {
  return text.length > 200 ? `${text.length}:${text.slice(0, 200)}` : text;
}

export function isRagDisabled(): boolean {
  if (process.env.NIT_RAG_ENABLED === "0") return true;
  return disabled;
}

export async function embedText(
  text: string,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (isRagDisabled()) return null;
  if (!text.trim()) return null;

  const key = cacheKey(text);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(`${LMSTUDIO_BASE}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.slice(0, MAX_TEXT_LEN),
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vec = data.data?.[0]?.embedding;
    if (!vec || vec.length === 0) throw new Error("Empty embedding");

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
