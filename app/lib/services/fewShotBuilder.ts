/**
 * Адаптивный сбор few-shot блоков для Planner из RAG.
 *
 * Эволюция:
 *   ce6f1ed: фиксированный k=2, threshold 0.55, top-2 если выше порога
 *   6b47c9b: adaptive k по top-1 score + компактный TOON-формат
 *   d34a4ed: contextual retrieval — query префиксируется [niche|mood] перед embed
 *   7dce2fc: cross-encoder reranker поверх cosine кандидатов
 *   prev:    hybrid BM25 + dense с RRF fusion перед reranker
 *   HEAD:    extended trigger boost (Tier 4) — буст seeds с pricing/faq/hours/
 *            contact когда query содержит соответствующие trigger-слова
 *
 * Pipeline:
 *   1. Параллельно: cosine top-N (вкл. contextual) + BM25 top-N
 *   2. RRF fusion: объединяем ранжирования в единый топ → берём top-RERANK_POOL
 *   3. Cross-encoder rerank этого пула
 *   4. Extended trigger boost (Tier 4): +BOOST за каждое matched поле
 *   5. Adaptive k по top-1 финального score
 *
 * Почему BM25 рядом с dense:
 *   - dense эмбеддинги теряют редкие точные термины: BMW, IELTS 7.0, M&A,
 *     КБЖУ, имена городов, версии. BM25 это ловит идеально через IDF.
 *   - dense ловит семантические синонимы и перефразировки. RRF объединяет
 *     их без нормализации scores и без weight tuning.
 *
 * Adaptive логика. Пороги:
 *   COSINE режим (fallback):              RERANK режим (default):
 *     >= 0.85    → k=1                       >= 0.80    → k=1
 *     0.65-0.85  → k=2                       0.40-0.80  → k=2
 *     0.55-0.65  → k=3                       0.20-0.40  → k=3
 *     < 0.55     → k=0                       < 0.20     → k=0
 *
 * NIT_FEWSHOT_MAX_K (default 3) — потолок adaptive выбора
 * NIT_CONTEXTUAL_RETRIEVAL_ENABLED (default 1) — kill-switch контекста
 * NIT_RERANKER_ENABLED (default 1) — kill-switch reranker
 * NIT_HYBRID_BM25_ENABLED (default 1) — kill-switch BM25 fusion
 * NIT_EXTENDED_TRIGGER_BOOST_ENABLED (default 1) — kill-switch trigger boost
 */

import { search, bm25Search, type SearchResult, type BM25SearchResult } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";
import { logger } from "~/lib/utils/logger";
import { formatPlanCompact, approxTokenCount } from "~/lib/services/compactPlanFormat";
import { buildContextualText, extractQueryContext } from "~/lib/services/contextualEmbed";
import { rerank, isRerankerDisabled } from "~/lib/services/ragReranker";
import { reciprocalRankFusion } from "~/lib/services/rrfFusion";
import {
  detectExtendedTriggers,
  applyExtendedTriggerBoost,
  type ExtendedTriggers,
} from "~/lib/services/extendedTriggers";
import type { Plan } from "~/lib/utils/planSchema";

const SCOPE = "fewShotBuilder";

const COSINE_MIN = 0.55;
const COSINE_MID = 0.65;
const COSINE_HIGH = 0.85;

const RERANK_MIN = 0.20;
const RERANK_MID = 0.40;
const RERANK_HIGH = 0.80;

const CANDIDATE_POOL_SIZE = 6;     // сколько берём из cosine и BM25 каждый
const RERANK_POOL_SIZE = 6;        // сколько отправляем в reranker после RRF

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

function isHybridBM25Enabled(): boolean {
  return process.env.NIT_HYBRID_BM25_ENABLED !== "0";
}

export function decideAdaptiveK(topScore: number, maxK: number = 3): number {
  if (topScore >= COSINE_HIGH) return Math.min(1, maxK);
  if (topScore >= COSINE_MID) return Math.min(2, maxK);
  if (topScore >= COSINE_MIN) return Math.min(3, maxK);
  return 0;
}

export function decideAdaptiveKFromRerank(topScore: number, maxK: number = 3): number {
  if (topScore >= RERANK_HIGH) return Math.min(1, maxK);
  if (topScore >= RERANK_MID) return Math.min(2, maxK);
  if (topScore >= RERANK_MIN) return Math.min(3, maxK);
  return 0;
}

export type FewShotResult = {
  block: string;
  count: number;
  topScore: number;
  approxTokens: number;
  detectedNiche?: string;
  reranked: boolean;
  /** Использовался ли hybrid BM25+dense fusion (для дебага и eval). */
  hybrid: boolean;
  /** Какие extended-триггеры обнаружены в query (Tier 4). */
  triggers?: ExtendedTriggers;
  /** Сколько кандидатов забустилось extended-trigger boost-ом (Tier 4). */
  triggerBoosted?: number;
};

/**
 * Объединяет cosine + BM25 результаты в единый ranking через RRF.
 * Возвращает SearchResult в порядке RRF (id присутствующие в любом из источников).
 * Оригинальный cosine score возвращается для доков из cosine; BM25-only доки
 * получают score=0 (они всё равно пойдут в reranker, score их перевзвесит).
 */
function fuseRankings(
  cosine: SearchResult[],
  bm25: BM25SearchResult[],
): SearchResult[] {
  const cosineRanking = cosine.map((r) => r.doc.id);
  const bm25Ranking = bm25.map((r) => r.doc.id);

  const fused = reciprocalRankFusion([cosineRanking, bm25Ranking]);

  const docById = new Map<string, SearchResult>();
  for (const r of cosine) docById.set(r.doc.id, r);
  for (const r of bm25) {
    if (!docById.has(r.doc.id)) {
      docById.set(r.doc.id, { doc: r.doc, score: 0 });
    }
  }

  const result: SearchResult[] = [];
  for (const f of fused) {
    const sr = docById.get(f.id);
    if (sr) result.push(sr);
  }
  return result;
}

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
    hybrid: false,
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

    // === Шаг 2: Параллельно cosine + BM25 ===
    const useHybrid = isHybridBM25Enabled();
    const [cosineCandidates, bm25Candidates] = await Promise.all([
      search(query, {
        k: CANDIDATE_POOL_SIZE,
        category: "plan_example",
        signal,
        queryEmbedText,
      }),
      useHybrid
        ? bm25Search(query, { k: CANDIDATE_POOL_SIZE, category: "plan_example" })
        : Promise.resolve([] as BM25SearchResult[]),
    ]);

    if (cosineCandidates.length === 0 && bm25Candidates.length === 0) {
      return { ...empty, detectedNiche };
    }

    // === Шаг 3: RRF fusion (если hybrid включен) или только cosine ===
    const fusedCandidates: SearchResult[] = useHybrid
      ? fuseRankings(cosineCandidates, bm25Candidates)
      : cosineCandidates;

    if (fusedCandidates.length === 0) return { ...empty, detectedNiche };

    // === Шаг 4: Cross-encoder rerank ===
    let finalCandidates: Array<{ result: SearchResult; finalScore: number }>;
    let usedRerank = false;

    if (!isRerankerDisabled()) {
      const rerankInput = fusedCandidates.slice(0, RERANK_POOL_SIZE).map((c) => ({
        id: c.doc.id,
        text: (c.doc.metadata as { query?: string }).query ?? c.doc.text,
      }));
      const rerankScores = await rerank(query, rerankInput, signal);

      if (rerankScores) {
        usedRerank = true;
        const scoreById = new Map(rerankScores.map((r) => [r.id, r.score]));
        finalCandidates = fusedCandidates
          .slice(0, RERANK_POOL_SIZE)
          .map((c) => ({ result: c, finalScore: scoreById.get(c.doc.id) ?? 0 }))
          .sort((a, b) => b.finalScore - a.finalScore);
      } else {
        // Reranker fallback — используем cosine score (у BM25-only доков = 0,
        // они уйдут в хвост — разумный fallback)
        finalCandidates = fusedCandidates.map((c) => ({ result: c, finalScore: c.score }));
      }
    } else {
      finalCandidates = fusedCandidates.map((c) => ({ result: c, finalScore: c.score }));
    }

    // === Шаг 4.5 (Tier 4): Extended trigger boost ===
    // Если query содержит trigger-слова (тариф/FAQ/часы/телефон), бустим
    // кандидатов у которых в плане заполнены соответствующие extended-поля.
    // Без триггеров — no-op, baseline сохраняется.
    const triggers = detectExtendedTriggers(query);
    const boostResult = applyExtendedTriggerBoost(
      finalCandidates,
      triggers,
      (sr) => (sr.doc.metadata as { plan?: Plan }).plan,
    );
    finalCandidates = boostResult.candidates;

    // === Шаг 5: Adaptive k по top-1 финального score (с учётом boost) ===
    const topScore = finalCandidates[0]!.finalScore;
    const k = usedRerank
      ? decideAdaptiveKFromRerank(topScore, getMaxK())
      : decideAdaptiveK(topScore, getMaxK());

    if (k === 0) {
      logger.info(
        SCOPE,
        `Top score ${topScore.toFixed(2)} below threshold (${usedRerank ? "rerank" : "cosine"}), skipping few-shot (niche=${detectedNiche ?? "?"}, hybrid=${useHybrid})`,
      );
      return {
        ...empty,
        topScore,
        detectedNiche,
        reranked: usedRerank,
        hybrid: useHybrid,
        triggers,
        triggerBoosted: boostResult.boostedCount,
      };
    }

    // === Шаг 6: Форматирование блока ===
    const selected = finalCandidates.slice(0, k);
    const formatted = selected
      .map((c, i) => {
        const meta = c.result.doc.metadata as { query?: string; plan?: Plan };
        if (!meta.plan) return "";
        const compact = formatPlanCompact(meta.plan);
        const scorePercent = (c.finalScore * 100).toFixed(0);
        return `Пример ${i + 1} (релевантность ${scorePercent}%, запрос был: \"${meta.query ?? c.result.doc.text}\"):\n${compact}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!formatted) {
      return {
        ...empty,
        topScore,
        detectedNiche,
        reranked: usedRerank,
        hybrid: useHybrid,
        triggers,
        triggerBoosted: boostResult.boostedCount,
      };
    }

    const block = `\n\nПРИМЕРЫ ХОРОШИХ ПЛАНОВ ИЗ БАЗЫ (учись на структуре копирайта и конкретике фактов, но адаптируй под текущий запрос — не копируй дословно):\n${formatted}\n`;
    const approxTokens = approxTokenCount(block);

    logger.info(
      SCOPE,
      `Few-shot: top=${topScore.toFixed(2)} (${usedRerank ? "rerank" : "cosine"}), k=${selected.length}, ~${approxTokens} tokens, niche=${detectedNiche ?? "?"}, contextual=${queryEmbedText ? "yes" : "no"}, hybrid=${useHybrid} (cos=${cosineCandidates.length}, bm25=${bm25Candidates.length}), triggerBoost=${boostResult.boostedCount}`,
    );

    return {
      block,
      count: selected.length,
      topScore,
      approxTokens,
      detectedNiche,
      reranked: usedRerank,
      hybrid: useHybrid,
      triggers,
      triggerBoosted: boostResult.boostedCount,
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
