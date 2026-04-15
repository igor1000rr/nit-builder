/**
 * Адаптивный сбор few-shot блоков для Planner из RAG.
 *
 * Эволюция:
 *   ce6f1ed: фиксированный k=2, threshold 0.55, top-2 если выше порога
 *   6b47c9b: adaptive k по top-1 score + компактный TOON-формат
 *   d34a4ed: contextual retrieval — query префиксируется [niche|mood] перед embed
 *   HEAD:    cross-encoder reranker поверх cosine кандидатов
 *
 * Двухэтапный pipeline:
 *   1. Cosine top-CANDIDATE_POOL_SIZE (быстрый retrieval, вкл. contextual prefix)
 *   2. Cross-encoder rerank top-RERANK_POOL_SIZE из кандидатов (точный перевзвес)
 *   3. Adaptive k по top-1 rerank score → финальный набор примеров
 *
 * Adaptive логика. Пороги разные для cosine vs rerank — cross-encoder
 * выдаёт более экстремальные scores (релевантные → 0.9+, шум → <0.1):
 *
 *   COSINE режим (fallback):              RERANK режим (default):
 *     >= 0.85    → k=1                       >= 0.80    → k=1
 *     0.65-0.85  → k=2                       0.40-0.80  → k=2
 *     0.55-0.65  → k=3                       0.20-0.40  → k=3
 *     < 0.55     → k=0                       < 0.20     → k=0
 *
 * NIT_FEWSHOT_MAX_K (default 3) — потолок adaptive выбора.
 * NIT_CONTEXTUAL_RETRIEVAL_ENABLED (default 1) — kill-switch контекста
 * NIT_RERANKER_ENABLED (default 1) — kill-switch reranker (в ragReranker.ts)
 */

import { search, type SearchResult } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";
import { logger } from "~/lib/utils/logger";
import { formatPlanCompact, approxTokenCount } from "~/lib/services/compactPlanFormat";
import { buildContextualText, extractQueryContext } from "~/lib/services/contextualEmbed";
import { rerank, isRerankerDisabled } from "~/lib/services/ragReranker";
import type { Plan } from "~/lib/utils/planSchema";

const SCOPE = "fewShotBuilder";

// === Cosine режим (fallback когда reranker недоступен) ===
const COSINE_MIN = 0.55;
const COSINE_MID = 0.65;
const COSINE_HIGH = 0.85;

// === Rerank режим (default) ===
// Cross-encoder выдаёт более polarized scores: релевант → высоко, шум → низко.
// Пороги выведены эмпирически на bge-reranker-v2-m3 и наших 24 seed-нишах.
const RERANK_MIN = 0.20;
const RERANK_MID = 0.40;
const RERANK_HIGH = 0.80;

const CANDIDATE_POOL_SIZE = 6;  // cosine этап
const RERANK_POOL_SIZE = 6;     // сколько отправляем в reranker (обычно все cosine кандидаты)

function getMaxK(): number {
  const newK = process.env.NIT_FEWSHOT_MAX_K;
  const legacyK = process.env.NIT_FEWSHOT_K;
  const raw = newK ?? legacyK;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return 3;
  return n;
}

function isContextualRetrievalEnabled(): boolean {
  return process.env.NIT_CONTEXTUAL_RETRIEVAL_ENABLED !== "0";
}

/** Cosine пороги (fallback). Pure function. */
export function decideAdaptiveK(topScore: number, maxK: number = 3): number {
  if (topScore >= COSINE_HIGH) return Math.min(1, maxK);
  if (topScore >= COSINE_MID) return Math.min(2, maxK);
  if (topScore >= COSINE_MIN) return Math.min(3, maxK);
  return 0;
}

/** Rerank пороги (default когда cross-encoder работает). Pure function. */
export function decideAdaptiveKFromRerank(topScore: number, maxK: number = 3): number {
  if (topScore >= RERANK_HIGH) return Math.min(1, maxK);
  if (topScore >= RERANK_MID) return Math.min(2, maxK);
  if (topScore >= RERANK_MIN) return Math.min(3, maxK);
  return 0;
}

export type FewShotResult = {
  /** Собранный блок для вставки в Planner system prompt. "" если нет релевантных. */
  block: string;
  /** Сколько примеров реально вошло в блок (для SSE event и метрик). */
  count: number;
  /** Скор лучшего матча. Будет rerank score если реранкер работал, иначе cosine. */
  topScore: number;
  /** Оценка токенов в block. */
  approxTokens: number;
  /** Угаданная ниша из query (для дебага). */
  detectedNiche?: string;
  /** Был ли применён cross-encoder rerank (для дебага и eval-метрик). */
  reranked: boolean;
};

/**
 * Основная функция. Cosine → (опционально) rerank → adaptive k → compact format.
 */
export async function buildFewShotPlansAdaptive(
  query: string,
  signal?: AbortSignal,
): Promise<FewShotResult> {
  const empty: FewShotResult = {
    block: "",
    count: 0,
    topScore: 0,
    approxTokens: 0,
    reranked: false,
  };

  try {
    await ensureSeeded();

    // === Шаг 1: Contextual retrieval prefix для query ===
    let queryEmbedText: string | undefined;
    let detectedNiche: string | undefined;
    if (isContextualRetrievalEnabled()) {
      const ctx = extractQueryContext(query);
      if (ctx.niche || ctx.mood) {
        queryEmbedText = buildContextualText(query, ctx);
        detectedNiche = ctx.niche;
      }
    }

    // === Шаг 2: Cosine top-N ===
    const cosineCandidates = await search(query, {
      k: CANDIDATE_POOL_SIZE,
      category: "plan_example",
      signal,
      queryEmbedText,
    });

    if (cosineCandidates.length === 0) {
      return { ...empty, detectedNiche };
    }

    // === Шаг 3: Cross-encoder rerank (если доступен) ===
    let finalCandidates: Array<{ result: SearchResult; finalScore: number }>;
    let usedRerank = false;

    if (!isRerankerDisabled()) {
      const rerankInput = cosineCandidates.slice(0, RERANK_POOL_SIZE).map((c) => ({
        id: c.doc.id,
        // Для reranker подаём исходный query (seed) — это то что описывает бизнес,
        // а не contextualText с префиксом [niche]. Cross-encoder сам выведёт релевантность
        // из содержания.
        text: (c.doc.metadata as { query?: string }).query ?? c.doc.text,
      }));
      const rerankScores = await rerank(query, rerankInput, signal);

      if (rerankScores) {
        usedRerank = true;
        const scoreById = new Map(rerankScores.map((r) => [r.id, r.score]));
        finalCandidates = cosineCandidates
          .slice(0, RERANK_POOL_SIZE)
          .map((c) => ({ result: c, finalScore: scoreById.get(c.doc.id) ?? 0 }))
          .sort((a, b) => b.finalScore - a.finalScore);
      } else {
        // Reranker вернул null — fallback на cosine score
        finalCandidates = cosineCandidates.map((c) => ({ result: c, finalScore: c.score }));
      }
    } else {
      finalCandidates = cosineCandidates.map((c) => ({ result: c, finalScore: c.score }));
    }

    // === Шаг 4: Adaptive k по top-1 финального score ===
    const topScore = finalCandidates[0]!.finalScore;
    const k = usedRerank
      ? decideAdaptiveKFromRerank(topScore, getMaxK())
      : decideAdaptiveK(topScore, getMaxK());

    if (k === 0) {
      logger.info(
        SCOPE,
        `Top score ${topScore.toFixed(2)} below threshold (${usedRerank ? "rerank" : "cosine"}), skipping few-shot (niche=${detectedNiche ?? "?"})`,
      );
      return { ...empty, topScore, detectedNiche, reranked: usedRerank };
    }

    // === Шаг 5: Форматирование блока ===
    const selected = finalCandidates.slice(0, k);
    const formatted = selected
      .map((c, i) => {
        const meta = c.result.doc.metadata as { query?: string; plan?: Plan };
        if (!meta.plan) return "";
        const compact = formatPlanCompact(meta.plan);
        const scorePercent = (c.finalScore * 100).toFixed(0);
        return `Пример ${i + 1} (релевантность ${scorePercent}%, запрос был: "${meta.query ?? c.result.doc.text}"):\n${compact}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!formatted) return { ...empty, topScore, detectedNiche, reranked: usedRerank };

    const block = `\n\nПРИМЕРЫ ХОРОШИХ ПЛАНОВ ИЗ БАЗЫ (учись на структуре копирайта и конкретике фактов, но адаптируй под текущий запрос — не копируй дословно):\n${formatted}\n`;
    const approxTokens = approxTokenCount(block);

    logger.info(
      SCOPE,
      `Few-shot: top=${topScore.toFixed(2)} (${usedRerank ? "rerank" : "cosine"}), k=${selected.length}, ~${approxTokens} tokens, niche=${detectedNiche ?? "?"}, contextual=${queryEmbedText ? "yes" : "no"}`,
    );

    return {
      block,
      count: selected.length,
      topScore,
      approxTokens,
      detectedNiche,
      reranked: usedRerank,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(SCOPE, `Few-shot fetch failed: ${(err as Error).message}`);
    return empty;
  }
}

export async function buildFewShotPlansBlock(
  query: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await buildFewShotPlansAdaptive(query, signal);
  return result.block;
}
