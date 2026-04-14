/**
 * Continuation: когда модель упирается в maxOutputTokens, HTML обрывается
 * (finishReason === "length"). Вместо того чтобы затыкать дыры через repairTruncatedHtml
 * и выдавать ломанный сайт — предлагаем юзеру кнопку Continue. Та тригерит
 * новый вызов с промптом "допиши отсюда" и мы склеиваем результат.
 *
 * Техника взята из Anthropic: системный промпт жёстко требует продолжить
 * с точки обрыва (первый токен должен логично следовать за последним символом TAIL),
 * не начинать с <!DOCTYPE>, не повторять. Если модель всё же повторила хвост —
 * joinPartialAndContinuation находит перекрытие и сносит дубликат.
 */

import type { Plan } from "~/lib/utils/planSchema";

export const CONTINUATION_TAIL_CHARS = 1500;
export const MAX_CONTINUATION_ATTEMPTS = 3;
const MIN_OVERLAP = 20;

export const CONTINUATION_SYSTEM_PROMPT = `Ты — продолжатель HTML-генерации. Предыдущий прогон наткнулся на лимит токенов и HTML оборвался.

ТВОЯ ЗАДАЧА:
1. Прочитай блок TAIL — последние символы уже сгенерированного HTML.
2. Продолжи С ТОЧКИ ОБРЫВА. Твой первый токен должен логично следовать за последним символом TAIL. Если TAIL обрывается посреди атрибута, тега, слова — допиши его, не начинай новое.
3. Доведи HTML до закрывающего </html>. Добавь недостающие секции если нужно.
4. Сохрани стиль, палитру, шрифты, Tailwind-классы из TAIL. Не меняй дизайн.

ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = провал):
- НЕ пиши preamble, пояснения, markdown-блоки \`\`\`.
- НЕ начинай с <!DOCTYPE>, <html>, <head> — это уже есть в TAIL.
- НЕ повторяй уже сгенерированный HTML из TAIL.
- НЕ пиши комментарии типа <!-- продолжение -->.

ВЫВОД: только недостающий HTML-фрагмент от точки обрыва до </html>.`;

export type ContinuationContext = {
  userMessage: string;
  plan?: Plan;
  tail: string;
};

export function buildContinuationUserMessage(ctx: ContinuationContext): string {
  const planSummary = ctx.plan
    ? JSON.stringify({
        color_mood: ctx.plan.color_mood,
        tone: ctx.plan.tone,
        sections: ctx.plan.sections,
        language: ctx.plan.language,
      })
    : null;

  return `ИСХОДНЫЙ ЗАПРОС ПОЛЬЗОВАТЕЛЯ: ${ctx.userMessage}
${planSummary ? `\nКРАТКИЙ ПЛАН (стиль/секции): ${planSummary}\n` : ""}
TAIL (последние ${ctx.tail.length} символов уже сгенерированного HTML):
\`\`\`html
${ctx.tail}
\`\`\`

Продолжи с точки обрыва до </html>. Только HTML, без комментариев.`;
}

/**
 * Склеивает partial + continuation, удаляя перекрытие если модель
 * решила повторить хвост. Алгоритм: ищем максимальный суффикс partial,
 * который совпадает с префиксом continuation. Если overlap есть — срезаем
 * его с continuation. Минимальный overlap 20 символов — ниже риск false positive.
 */
export function joinPartialAndContinuation(
  partial: string,
  continuation: string,
): string {
  if (!continuation) return partial;
  if (!partial) return continuation;

  const maxOverlap = Math.min(partial.length, continuation.length, 500);
  for (let overlap = maxOverlap; overlap >= MIN_OVERLAP; overlap--) {
    const partialTail = partial.slice(-overlap);
    const contHead = continuation.slice(0, overlap);
    if (partialTail === contHead) {
      return partial + continuation.slice(overlap);
    }
  }

  return partial + continuation;
}

/**
 * Убирает markdown обёртки чтобы TAIL не содержал \`\`\`html и
 * модель не думала что генерация уже закрыта фенсов. ВАЖНО: НЕ
 * доделывает </html>, не реставрирует теги. Оставляет HTML как он есть
 * для того чтобы continuation мог точно продолжить.
 */
export function cleanRawForTail(raw: string): string {
  return raw
    .replace(/^\s*```html\s*\n?/i, "")
    .replace(/^\s*```\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trimEnd();
}

export function extractTail(raw: string, maxChars = CONTINUATION_TAIL_CHARS): string {
  const cleaned = cleanRawForTail(raw);
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(-maxChars);
}
