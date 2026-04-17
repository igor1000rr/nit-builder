/**
 * Keyword-based template selector — fallback для контекстов где
 * embedding-based templateRetriever недоступен (WS generate в wsHandlers:
 * там нет провайдера на сервере, LLM только на стороне туннеля).
 *
 * Алгоритм простой: скорим каждый template по совпадениям из bestFor
 * (keyword match = +10) и слов из description (fuzzy match = +2).
 * Если max score = 0 — возвращаем fallback "coffee-shop" (самый универсальный
 * warm-minimalist лендинг, хорошо выглядит при любом промпте).
 *
 * Быстро, детерминировано, работает на нулевых ресурсах.
 */

import { TEMPLATE_CATALOG, type TemplateMeta } from "~/lib/config/htmlTemplatesCatalog";

const FALLBACK_ID = "coffee-shop";

/** Разбивает строку на нормализованные слова (lower, без пунктуации, min 3 char). */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function scoreTemplate(t: TemplateMeta, promptTokens: Set<string>, promptLower: string): number {
  let score = 0;

  // Strong match: keyword из bestFor встречается как substring в промпте.
  // Substring лучше чем token-match потому что "кофейня" должно матчиться
  // и в "ищу кофейню", и в "моя кофейня".
  for (const kw of t.bestFor) {
    const kwLower = kw.toLowerCase();
    if (promptLower.includes(kwLower)) score += 10;
  }

  // Weak match: токены из description пересекаются с токенами промпта.
  const descTokens = tokenize(t.description);
  for (const tok of descTokens) {
    if (promptTokens.has(tok)) score += 2;
  }

  // Weak match: название category пересекается
  if (promptTokens.has(t.category)) score += 3;

  return score;
}

/**
 * Возвращает (id, name) самого релевантного шаблона.
 * Никогда не возвращает null — в worst case fallback "coffee-shop".
 */
export function inferTemplateFromPrompt(prompt: string): {
  id: string;
  name: string;
  sections: string[];
} {
  const promptLower = prompt.toLowerCase();
  const promptTokens = new Set(tokenize(prompt));

  let best: TemplateMeta | null = null;
  let bestScore = 0;
  for (const t of TEMPLATE_CATALOG) {
    const s = scoreTemplate(t, promptTokens, promptLower);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }

  const chosen =
    best && bestScore > 0
      ? best
      : (TEMPLATE_CATALOG.find((t) => t.id === FALLBACK_ID) ?? TEMPLATE_CATALOG[0]!);

  return {
    id: chosen.id,
    name: chosen.name,
    sections: chosen.sections,
  };
}
