/**
 * Адаптивный сбор few-shot блоков для Planner из RAG.
 *
 * Эволюция от ce6f1ed:
 *   - было: фиксированный k=2, threshold 0.55, всегда top-2 если выше порога
 *   - стало: adaptive k по top-1 score + компактный TOON-формат вместо JSON
 *
 * Adaptive логика (top-1 similarity):
 *   >= 0.85          → k=1 (один отличный пример лучше двух средних — снижает шум)
 *   0.65 - 0.85      → k=2
 *   0.55 - 0.65      → k=3 (искать паттерн в нескольких слабых матчах)
 *   < 0.55           → k=0 (не подмешиваем шум, Planner работает без few-shot)
 *
 * NIT_FEWSHOT_MAX_K (default 3) — потолок adaptive выбора.
 * Старый NIT_FEWSHOT_K читается ради backward-compat как hard cap (если задан).
 *
 * Компактный формат (compactPlanFormat.ts) даёт 2-3× компрессию vs JSON.
 */

import { search } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";
import { logger } from "~/lib/utils/logger";
import { formatPlanCompact, approxTokenCount } from "~/lib/services/compactPlanFormat";
import type { Plan } from "~/lib/utils/planSchema";

const SCOPE = "fewShotBuilder";

const MIN_SIMILARITY = 0.55;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MID_CONFIDENCE_THRESHOLD = 0.65;
const CANDIDATE_POOL_SIZE = 6; // берём больше из RAG, потом обрезаем по adaptive k

function getMaxK(): number {
  // Новая переменная имеет приоритет; старая читается как fallback cap
  const newK = process.env.NIT_FEWSHOT_MAX_K;
  const legacyK = process.env.NIT_FEWSHOT_K;
  const raw = newK ?? legacyK;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return 3;
  return n;
}

/** Решает сколько примеров подмешивать по топ-1 score. Pure function (тестируемая). */
export function decideAdaptiveK(topScore: number, maxK: number = 3): number {
  if (topScore >= HIGH_CONFIDENCE_THRESHOLD) return Math.min(1, maxK);
  if (topScore >= MID_CONFIDENCE_THRESHOLD) return Math.min(2, maxK);
  if (topScore >= MIN_SIMILARITY) return Math.min(3, maxK);
  return 0;
}

export type FewShotResult = {
  /** Собранный блок для вставки в Planner system prompt. "" если нет релевантных. */
  block: string;
  /** Сколько примеров реально вошло в блок (для SSE event и метрик). */
  count: number;
  /** Скор лучшего матча (для логов). */
  topScore: number;
  /** Оценка токенов в block (для метрик). */
  approxTokens: number;
};

/**
 * Ищет в RAG plan_example, выбирает adaptive k, форматирует компактный блок.
 * Грациозно возвращает пустой результат при отключённом RAG / ошибках.
 */
export async function buildFewShotPlansAdaptive(
  query: string,
  signal?: AbortSignal,
): Promise<FewShotResult> {
  const empty: FewShotResult = { block: "", count: 0, topScore: 0, approxTokens: 0 };

  try {
    await ensureSeeded();

    const candidates = await search(query, {
      k: CANDIDATE_POOL_SIZE,
      category: "plan_example",
      signal,
    });

    if (candidates.length === 0) return empty;

    const topScore = candidates[0]!.score;
    const k = decideAdaptiveK(topScore, getMaxK());
    if (k === 0) {
      logger.info(SCOPE, `Top score ${topScore.toFixed(2)} below threshold ${MIN_SIMILARITY}, skipping few-shot`);
      return { ...empty, topScore };
    }

    const selected = candidates.slice(0, k);
    const formatted = selected
      .map((r, i) => {
        const meta = r.doc.metadata as { query?: string; plan?: Plan };
        if (!meta.plan) return "";
        const compact = formatPlanCompact(meta.plan);
        return `Пример ${i + 1} (схожесть ${(r.score * 100).toFixed(0)}%, запрос был: "${meta.query ?? r.doc.text}"):\n${compact}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!formatted) return { ...empty, topScore };

    const block = `\n\nПРИМЕРЫ ХОРОШИХ ПЛАНОВ ИЗ БАЗЫ (учись на структуре копирайта и конкретике фактов, но адаптируй под текущий запрос — не копируй дословно):\n${formatted}\n`;
    const approxTokens = approxTokenCount(block);

    logger.info(
      SCOPE,
      `Adaptive few-shot: top=${topScore.toFixed(2)}, k=${selected.length}, ~${approxTokens} tokens`,
    );

    return { block, count: selected.length, topScore, approxTokens };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(SCOPE, `Few-shot fetch failed: ${(err as Error).message}`);
    return empty;
  }
}

/**
 * Backward-compat shim. Старый API который возвращал только строку.
 * Orchestrator сейчас использует этот wrapper. Можно потом перевести на прямой buildFewShotPlansAdaptive.
 */
export async function buildFewShotPlansBlock(
  query: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await buildFewShotPlansAdaptive(query, signal);
  return result.block;
}
