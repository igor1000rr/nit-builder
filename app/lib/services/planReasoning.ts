/**
 * Two-step Planner: первый шаг — короткий free-form анализ запроса.
 *
 * Why: forcing JSON during reasoning документированно снижает качество
 * на 10-15% (модель тратит cognitive resources на форматирование вместо
 * содержательного думания). Решение — двухстадийный pipeline:
 *   Step 1: свободное рассуждение (3-5 строк, бан-фразы запрещены)
 *   Step 2: structured generateObject видит query + reasoning + few-shot
 *
 * Step 1 стоит ~200-300 output токенов и одну дополнительную модель-итерацию,
 * но окупается за счёт более качественного и конкретного плана. Это особенно
 * заметно на семирующих моделях (Qwen 2.5 Coder 7B).
 *
 * При AbortError или любой ошибке возвращается пустая строка — Planner
 * работает как раньше (graceful degradation).
 */

import { generateText } from "ai";
import { logger } from "~/lib/utils/logger";
import type { getModel } from "~/lib/llm/client";

const SCOPE = "planReasoning";

export const PLAN_REASONING_SYSTEM = `Ты — стратег. Прочитай запрос на сайт и за 3-5 коротких строк опиши:
1. БИЗНЕС: что за дело, размер, специфика (1 строка)
2. АУДИТОРИЯ: кому это нужно, в какой момент жизни (1 строка)
3. ОТСТРОЙКА: чем отличается от средней массы (1-2 конкретных факта или цифры)
4. ТОНАЛЬНОСТЬ: как звучит коммуникация (2-3 слова)
5. СЕКЦИИ: какие 4-7 секций сайта обязательны (через запятую)

ЗАПРЕЩЕНО: "качество", "профессионализм", "индивидуальный подход", "добро пожаловать", "наша миссия", "широкий спектр", "квалифицированные специалисты".

Ответ короткий, по делу. Без преамбул, без markdown, без нумерации звёздочками. Каждый пункт начинается с КАПСНОГО ярлыка.`;

export function isReasoningEnabled(): boolean {
  return process.env.NIT_PLAN_REASONING_ENABLED !== "0";
}

export function getReasoningMaxTokens(): number {
  const raw = process.env.NIT_PLAN_REASONING_MAX_TOKENS;
  if (!raw) return 300;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 100 || n > 800) return 300;
  return n;
}

/**
 * Генерирует короткий аналитический preamble. Возвращает пустую строку при
 * отключении или любой ошибке кроме AbortError.
 */
export async function generatePlanReasoning(
  model: ReturnType<typeof getModel>,
  query: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!isReasoningEnabled()) return "";

  try {
    const { text } = await generateText({
      model,
      system: PLAN_REASONING_SYSTEM,
      prompt: query,
      maxOutputTokens: getReasoningMaxTokens(),
      temperature: 0.4,
      abortSignal: signal,
    });

    const cleaned = text.trim();
    if (cleaned.length === 0) return "";

    logger.info(SCOPE, `Reasoning generated: ${cleaned.length} chars`);
    return cleaned;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(SCOPE, `Reasoning failed: ${(err as Error).message}, continuing without`);
    return "";
  }
}

/** Склеивает query + reasoning в один prompt для Planner step 2. */
export function buildAugmentedPlannerPrompt(query: string, reasoning: string): string {
  if (!reasoning) return query;
  return `${query}\n\nПРЕДВАРИТЕЛЬНЫЙ АНАЛИЗ:\n${reasoning}`;
}
