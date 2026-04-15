/**
 * Section-only Polish — экономия токенов на point-edit запросах (Tier 3.5).
 *
 * Идея. Если intentClassifier определил targetSection ("поменяй текст героя"),
 * вместо отправки всего HTML (~6000-15000 chars) Coder-у мы:
 *   1. Извлекаем только эту секцию по data-nit-section="X"
 *   2. Шлём небольшой промпт с этим фрагментом + запрос юзера
 *   3. Модель возвращает обновлённую <section>...</section>
 *   4. Подставляем обратно через replaceSection
 *
 * Эффект:
 *   - prompt: ~1500 → ~400 токенов (-73%)
 *   - completion: ~4000 → ~600 токенов (-85%)
 *   - latency: ~15s → ~3-5s
 *   - точность: модель видит только нужный фрагмент, не "забывает" про остальное
 *
 * Когда НЕ срабатывает (фолбэк на full rewrite):
 *   - targetSection не определён (общий запрос типа "переделай сайт")
 *   - <section data-nit-section="X"> не найдена в HTML
 *   - модель вернула невалидный ответ (нет <section> в выводе)
 *   - ENV NIT_SECTION_POLISH_ENABLED=0
 */

import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { logger } from "~/lib/utils/logger";

const SCOPE = "sectionPolish";

export function isSectionPolishEnabled(): boolean {
  return process.env.NIT_SECTION_POLISH_ENABLED !== "0";
}

export type SectionExtractResult =
  | {
      found: true;
      sectionHtml: string;
      before: string;
      after: string;
      matchedBy: "data-nit-section" | "id";
    }
  | { found: false };

/**
 * Найти <section> по sectionId. Приоритет:
 *   1. data-nit-section="X" (надёжный маркер от enrichSectionAnchors)
 *   2. id="X" (для случаев когда anchors не проставлены)
 *
 * Возвращает HTML секции + куски до и после для последующей сборки.
 * Для парных тегов <section>...</section> используется простой не-вложенный поиск:
 * это безопасно потому что HTML-валидация запрещает вложенные <section> в семантике
 * (хотя технически возможно — но для наших шаблонов это не проблема).
 */
export function extractSection(
  html: string,
  sectionId: string,
): SectionExtractResult {
  const safeId = sectionId.replace(/[^a-z0-9_-]/gi, "");
  if (!safeId) return { found: false };

  const dataAttrRe = new RegExp(
    `<section[^>]*data-nit-section=["']${safeId}["'][^>]*>`,
    "i",
  );
  const idAttrRe = new RegExp(
    `<section[^>]*id=["']${safeId}["'][^>]*>`,
    "i",
  );

  let openMatch = html.match(dataAttrRe);
  let matchedBy: "data-nit-section" | "id" = "data-nit-section";
  if (!openMatch || openMatch.index === undefined) {
    openMatch = html.match(idAttrRe);
    matchedBy = "id";
  }
  if (!openMatch || openMatch.index === undefined) return { found: false };

  const start = openMatch.index;
  const closeMatch = html.slice(start).match(/<\/section\s*>/i);
  if (!closeMatch || closeMatch.index === undefined) return { found: false };

  const end = start + closeMatch.index + closeMatch[0].length;
  return {
    found: true,
    sectionHtml: html.slice(start, end),
    before: html.slice(0, start),
    after: html.slice(end),
    matchedBy,
  };
}

/**
 * Подставить новую секцию обратно. Вернёт null если оригинальный sectionId
 * не находится (между extract и replace что-то поменялось — параллельная правка).
 */
export function replaceSection(
  html: string,
  sectionId: string,
  newSectionHtml: string,
): string | null {
  const extracted = extractSection(html, sectionId);
  if (!extracted.found) return null;
  return extracted.before + newSectionHtml + extracted.after;
}

/**
 * Изолировать первый <section>...</section> блок из ответа модели.
 * Модель может обернуть в ```html, добавить пояснения — стрипаем всё лишнее.
 */
export function extractSectionFromResponse(raw: string): string | null {
  const cleaned = raw
    .replace(/^```html\s*/im, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const match = cleaned.match(/<section\b[\s\S]*?<\/section\s*>/i);
  return match ? match[0] : null;
}

const SECTION_POLISHER_SYSTEM_PROMPT = `Ты — HTML-редактор отдельной секции. Юзер прислал тебе фрагмент <section>...</section> и просит внести точечную правку.

ЖЁСТКИЕ ПРАВИЛА:
1. Возвращаешь ТОЛЬКО обновлённый <section>...</section> блок целиком. Без обёрток <!DOCTYPE>, <html>, <head>, <body>.
2. Сохраняешь все атрибуты открывающего <section>: id, class, data-nit-section, role, aria-*. Не трогай их.
3. Сохраняешь Tailwind-классы и адаптивность (sm:, md:, lg:) если правка их не касается.
4. Внеси ТОЛЬКО то что просит юзер. Не переписывай остальное.
5. Никаких import, require, ссылок на локальные файлы. Только inline SVG, emoji, Unsplash, CDN.
6. Никаких ```, никаких комментариев до или после. Первый символ ответа — <section, последний — >.`;

function buildSectionPolishUserMessage(params: {
  sectionHtml: string;
  userRequest: string;
  sectionId: string;
}): string {
  return `СЕКЦИЯ "${params.sectionId}":
\`\`\`html
${params.sectionHtml}
\`\`\`

ЗАПРОС: ${params.userRequest}

Верни обновлённый <section>...</section> целиком, без обёрток.`;
}

export type SectionPolishStreamResult = {
  rawText: string;
  finishReason: string;
  usage: { prompt: number; completion: number };
};

/**
 * Стримящий вариант для использования в orchestrator (yield text events).
 * Возвращает async generator — caller сам управляет yield-ами.
 */
export async function* polishSectionStream(params: {
  model: LanguageModel;
  sectionHtml: string;
  sectionId: string;
  userRequest: string;
  signal: AbortSignal;
  maxOutputTokens: number;
}): AsyncGenerator<
  { type: "delta"; text: string } | { type: "done"; result: SectionPolishStreamResult },
  void,
  void
> {
  const result = await streamText({
    model: params.model,
    system: SECTION_POLISHER_SYSTEM_PROMPT,
    prompt: buildSectionPolishUserMessage({
      sectionHtml: params.sectionHtml,
      userRequest: params.userRequest,
      sectionId: params.sectionId,
    }),
    maxOutputTokens: params.maxOutputTokens,
    temperature: 0.3,
    abortSignal: params.signal,
  });

  let raw = "";
  for await (const delta of result.textStream) {
    raw += delta;
    yield { type: "delta", text: delta };
  }

  let finishReason = "unknown";
  try {
    finishReason = String((await result.finishReason) ?? "unknown");
  } catch {}

  let usage = { prompt: 0, completion: 0 };
  try {
    const u = (await result.usage) as
      | {
          promptTokens?: number;
          inputTokens?: number;
          completionTokens?: number;
          outputTokens?: number;
        }
      | undefined;
    if (u) {
      usage = {
        prompt: u.promptTokens ?? u.inputTokens ?? 0,
        completion: u.completionTokens ?? u.outputTokens ?? 0,
      };
    }
  } catch {}

  yield { type: "done", result: { rawText: raw, finishReason, usage } };
  logger.info(
    SCOPE,
    `Section "${params.sectionId}" polish done: ${raw.length}ch, finishReason=${finishReason}, prompt=${usage.prompt}, completion=${usage.completion}`,
  );
}
