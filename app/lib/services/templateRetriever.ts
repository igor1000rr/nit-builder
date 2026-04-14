/**
 * Embedding-основанный retriever для каталога шаблонов.
 *
 * Проблема: все 22 шаблона в промпте планировщика это ~3.3KB на каждый
 * вызов, хотя реально релевантны 2-3 шаблона. Решение: сосчитать
 * эмбеддинги описаний шаблонов один раз, эмбеддинг запроса на каждый
 * вызов, cosine similarity → top-K. Передаём в планировщик только их.
 *
 * Требования: LM Studio должен иметь загруженную embedding-модель
 * (по умолчанию text-embedding-nomic-embed-text-v1.5). Если нет —
 * retrieveTemplates возвращает null, оркестратор фолбэчит на полный каталог.
 *
 * Отключение: NIT_DISABLE_EMBEDDING_RETRIEVER=1 в env (для тестов и юзеров
 * без embedding-модели).
 */

import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { TEMPLATE_CATALOG } from "~/lib/config/htmlTemplatesCatalog";
import { logger } from "~/lib/utils/logger";

const SCOPE = "templateRetriever";

type IndexEntry = { id: string; vec: number[] };

let cachedIndex: IndexEntry[] | null = null;
let indexBuildPromise: Promise<IndexEntry[]> | null = null;
let permanentlyDisabled = false;

function isDisabled(): boolean {
  if (permanentlyDisabled) return true;
  return process.env.NIT_DISABLE_EMBEDDING_RETRIEVER === "1";
}

function getEmbeddingClient() {
  const baseURL = (process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234").replace(
    /\/$/,
    "",
  );
  return createOpenAI({
    baseURL: `${baseURL}/v1`,
    apiKey: "lm-studio",
  });
}

function getEmbeddingModel() {
  const name =
    process.env.LMSTUDIO_EMBEDDING_MODEL ?? "text-embedding-nomic-embed-text-v1.5";
  return getEmbeddingClient().embedding(name);
}

function templateToText(
  t: (typeof TEMPLATE_CATALOG)[number],
): string {
  return `${t.name}. ${t.description} Подходит для: ${t.bestFor.join(", ")}. Стиль: ${t.style}. Категория: ${t.category}.`;
}

async function buildIndex(): Promise<IndexEntry[]> {
  if (cachedIndex) return cachedIndex;
  if (indexBuildPromise) return indexBuildPromise;

  indexBuildPromise = (async () => {
    const docs = TEMPLATE_CATALOG.map((t) => ({ id: t.id, text: templateToText(t) }));
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(),
      values: docs.map((d) => d.text),
    });
    const index: IndexEntry[] = docs.map((d, i) => ({
      id: d.id,
      vec: embeddings[i] as number[],
    }));
    cachedIndex = index;
    logger.info(SCOPE, `Built embedding index for ${index.length} templates`);
    return index;
  })();

  try {
    return await indexBuildPromise;
  } finally {
    indexBuildPromise = null;
  }
}

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/**
 * Найти top-K релевантных шаблонов для запроса.
 *
 * Возвращает массив id (отсортирован по убыванию релевантности) или null если:
 * - retriever отключён через env
 * - embedding-модель не доступна (после первого фейла отключается навсегда)
 * - пустой запрос
 *
 * Null → оркестратор передаёт полный каталог в планировщик (legacy fallback).
 */
export async function retrieveTemplates(
  query: string,
  topK: number = 5,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (isDisabled()) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const index = await buildIndex();
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: trimmed,
      abortSignal: signal,
    });
    const scored = index.map((e) => ({ id: e.id, score: cosine(e.vec, embedding) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.id);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(
      SCOPE,
      `Embedding retrieval failed (${(err as Error).message}), disabling retriever for this session`,
    );
    permanentlyDisabled = true;
    cachedIndex = null;
    return null;
  }
}

/** Для тестов: сброс внутреннего состояния. */
export function _resetRetrieverState(): void {
  cachedIndex = null;
  indexBuildPromise = null;
  permanentlyDisabled = false;
}
