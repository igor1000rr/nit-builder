/**
 * Few-shot блоки для Planner из RAG-результатов. Возвращает "" когда:
 *   - RAG отключён (env NIT_RAG_ENABLED=0 или embedding недоступен)
 *   - нет результатов выше MIN_SIMILARITY (0.55 — эмпирический порог)
 *   - произошла ошибка поиска
 *
 * Graceful: Planner продолжает работать без few-shot как раньше.
 */

import { search } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";
import { logger } from "~/lib/utils/logger";

const SCOPE = "fewShotBuilder";
const MIN_SIMILARITY = 0.55;

function parseK(): number {
  const raw = process.env.NIT_FEWSHOT_K;
  if (!raw) return 2;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return 2;
  return n;
}

export async function buildFewShotPlansBlock(
  query: string,
  signal?: AbortSignal,
): Promise<string> {
  const k = parseK();

  try {
    // Ленивая инициализация seeds при первом обращении
    await ensureSeeded();

    const results = await search(query, { k: k * 2, category: "plan_example", signal });
    const relevant = results.filter((r) => r.score >= MIN_SIMILARITY).slice(0, k);
    if (relevant.length === 0) return "";

    const formatted = relevant
      .map((r, i) => {
        const meta = r.doc.metadata as { query?: string; plan?: unknown };
        if (!meta.plan) return "";
        return `Пример ${i + 1} (сходство ${(r.score * 100).toFixed(0)}%):
Запрос: "${meta.query ?? r.doc.text}"
План: ${JSON.stringify(meta.plan)}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!formatted) return "";

    logger.info(
      SCOPE,
      `Few-shot: ${relevant.length} plan examples (scores ${relevant.map((r) => r.score.toFixed(2)).join(",")})`,
    );

    return `

ПРИМЕРЫ ХОРОШИХ ПЛАНОВ ИЗ БАЗЫ (учись на структуре копирайта и уровне конкретики, но адаптируй под текущий запрос — не копируй дословно):
${formatted}
`;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    logger.warn(SCOPE, `Few-shot fetch failed: ${(err as Error).message}`);
    return "";
  }
}
