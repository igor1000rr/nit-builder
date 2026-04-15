/**
 * Универсальное RAG-хранилище: JSONL на диске + in-memory Map + cosine search.
 *
 * Design choices:
 * - До ~3000 записей in-memory O(N) поиск даёт <20ms на 768-dim embeddings.
 *   Переезд на sqlite-vec / LanceDB — когда корпус выйдет за 3k записей.
 * - JSONL append-only: простой формат, легко мигрировать, человекочитаемый.
 * - Embeddings лениво: если у документа нет embedding — считаем при первом
 *   search и кешируем в памяти (не персистим пока — избегаем гонок записи).
 * - Graceful degradation: если LM Studio embedding не доступен — search
 *   возвращает []. Orchestrator работает без few-shot.
 *
 * Contextual Retrieval (Tier 2, since v3):
 * - Документ может иметь contextualText — текст с префиксом [niche | tone | mood].
 *   Embedding считается от contextualText ?? text (graceful degradation).
 *   На стороне поиска query тоже префиксируется через extractQueryContext.
 *
 * Категории документов:
 * - plan_example     — (query → полный Plan) для few-shot планировщика
 * - hero_headline    — готовые hero-фразы по нишам
 * - benefits         — наборы key_benefits (3-5 пунктов)
 * - social_proof     — social proof lines
 * - cta_microcopy    — микротексты под CTA
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { logger } from "~/lib/utils/logger";
import { embedText, isRagDisabled } from "~/lib/services/ragEmbeddings";

const SCOPE = "ragStore";
const STORE_DEFAULT_PATH = "/tmp/nit-rag.jsonl";

export type RagCategory =
  | "plan_example"
  | "hero_headline"
  | "benefits"
  | "social_proof"
  | "cta_microcopy";

export type RagDocument = {
  id: string;
  text: string;
  /**
   * Опциональный текст с контекстным префиксом для embedding.
   * Если задан — embedding считается от него; text используется только для отображения.
   * Backward-compat: старые документы без поля работают как раньше (embed от text).
   */
  contextualText?: string;
  category: RagCategory;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: number;
};

export type SearchOptions = {
  k?: number;
  category?: RagCategory;
  filter?: (doc: RagDocument) => boolean;
  signal?: AbortSignal;
  /**
   * Если задан — этот текст используется для embedding query вместо raw query.
   * Используется fewShotBuilder для contextual retrieval.
   */
  queryEmbedText?: string;
};

export type SearchResult = {
  doc: RagDocument;
  score: number;
};

const documents = new Map<string, RagDocument>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

function getStorePath(): string {
  return process.env.NIT_RAG_PATH ?? STORE_DEFAULT_PATH;
}

async function loadFromDisk(): Promise<void> {
  const p = getStorePath();
  try {
    const content = await fs.readFile(p, "utf8");
    const lines = content.split("\n").filter(Boolean);
    let loaded_count = 0;
    for (const line of lines) {
      try {
        const doc = JSON.parse(line) as RagDocument;
        if (doc.id && doc.text && doc.category) {
          documents.set(doc.id, doc);
          loaded_count++;
        }
      } catch {
        // битая строка — пропуск
      }
    }
    logger.info(SCOPE, `Loaded ${loaded_count} docs from ${p}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(SCOPE, `Load failed: ${(err as Error).message}`);
    }
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = loadFromDisk().finally(() => {
      loaded = true;
    });
  }
  await loadPromise;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function appendToFile(doc: RagDocument): Promise<void> {
  const p = getStorePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, `${JSON.stringify(doc)}\n`, "utf8");
}

async function ensureEmbedding(
  doc: RagDocument,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (doc.embedding && doc.embedding.length > 0) return doc.embedding;
  // Используем contextualText если есть (Tier 2 contextual retrieval), иначе raw text
  const sourceText = doc.contextualText ?? doc.text;
  const vec = await embedText(sourceText, signal);
  if (!vec) return null;
  doc.embedding = vec;
  return vec;
}

export async function hasDocument(id: string): Promise<boolean> {
  await ensureLoaded();
  return documents.has(id);
}

export async function addDocument(input: {
  id?: string;
  text: string;
  contextualText?: string;
  category: RagCategory;
  metadata?: Record<string, unknown>;
  skipPersist?: boolean;
  skipEmbed?: boolean;
}): Promise<RagDocument | null> {
  if (isRagDisabled() && !input.skipEmbed) return null;
  await ensureLoaded();

  const id =
    input.id ??
    `${input.category}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  if (documents.has(id)) return documents.get(id)!;

  const doc: RagDocument = {
    id,
    text: input.text.slice(0, 4000),
    category: input.category,
    metadata: input.metadata ?? {},
    createdAt: Date.now(),
  };

  if (input.contextualText) {
    doc.contextualText = input.contextualText.slice(0, 4200);
  }

  if (!input.skipEmbed) {
    try {
      // Embed contextual версию если есть, иначе raw text
      const embedSource = doc.contextualText ?? doc.text;
      const vec = await embedText(embedSource);
      if (vec) doc.embedding = vec;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      logger.warn(SCOPE, `Embed failed for ${id}: ${(err as Error).message}`);
    }
  }

  documents.set(id, doc);

  if (!input.skipPersist) {
    try {
      await appendToFile(doc);
    } catch (err) {
      logger.warn(SCOPE, `Persist failed: ${(err as Error).message}`);
    }
  }

  return doc;
}

export async function search(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  if (isRagDisabled()) return [];
  await ensureLoaded();

  const k = opts.k ?? 3;
  if (documents.size === 0) return [];

  // queryEmbedText (если задан вызывающим) используется для contextual retrieval —
  // это query с тем же префиксом который применялся при индексации seed-ов.
  const embedSource = opts.queryEmbedText ?? query;

  let qVec: number[] | null;
  try {
    qVec = await embedText(embedSource, opts.signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return [];
  }
  if (!qVec) return [];

  const scored: SearchResult[] = [];
  for (const doc of documents.values()) {
    if (opts.category && doc.category !== opts.category) continue;
    if (opts.filter && !opts.filter(doc)) continue;
    if (doc.metadata.isSentinel) continue;

    const vec = await ensureEmbedding(doc, opts.signal);
    if (!vec) continue;
    scored.push({ doc, score: cosine(qVec, vec) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function getStats(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const doc of documents.values()) {
    if (doc.metadata.isSentinel) continue;
    byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
  }
  return { total: Object.values(byCategory).reduce((s, n) => s + n, 0), byCategory };
}

export async function _resetForTests(): Promise<void> {
  documents.clear();
  loaded = false;
  loadPromise = null;
}
