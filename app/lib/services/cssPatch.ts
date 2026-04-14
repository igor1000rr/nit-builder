/**
 * CSS-патч режим для Polisher.
 *
 * Когда юзер просит визуальную правку ("сделай фон синим", "увеличь заголовки"),
 * мы НЕ регенерируем весь HTML (6000-12000 output токенов). Вместо этого
 * просим модель выдать СПИСОК CSS-правил и инъектируем их в блок
 * <style id="nit-overrides"> в <head>. С !important они перебивают Tailwind-классы.
 *
 * Эффект по токенам: 6000+ → ~200. На порядок экономии в типичных правках.
 */

import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { logger } from "~/lib/utils/logger";

const SCOPE = "cssPatch";

/**
 * Схема ответа модели. Ограничения на длины и количества защищают
 * от моделей, которые любят разворачиваться в простыня.
 */
const CssRuleSchema = z.object({
  selector: z.string().min(1).max(200),
  properties: z.record(z.string().min(1).max(200)),
});

export const CssPatchSchema = z.object({
  rules: z.array(CssRuleSchema).min(1).max(20),
});

export type CssRule = z.infer<typeof CssRuleSchema>;
export type CssPatch = z.infer<typeof CssPatchSchema>;

const CSS_PATCHER_SYSTEM = `Ты — CSS-патчер. По запросу пользователя выдаёшь МИНИМАЛЬНЫЙ набор CSS-правил, перебивающих существующие стили.

КОНТЕКСТ:
- Сайт использует Tailwind CDN (семантика классов bg-*, text-*, p-*, font-*, etc).
- Твои правила пойдут в <style id="nit-overrides"> в <head>.
- !important добавляется автоматически ко всем свойствам — ты его НЕ пишешь.

ПРИНЦИПЫ:
1. Минимум правил. 1-5 правил для типичного запроса. Не раздувай.
2. Широкие селекторы: body, h1, h2, h3, button, a, section, .hero, .pricing.
3. Цвета — hex (#3b82f6) или rgb(). Избегай hsl без необходимости.
4. Для фона сайта — селектор body. Для секций — section или .hero/.pricing/etc.
5. НЕ пытайся менять структуру, текст или контент — только визуальные свойства.
6. Для "тёмной темы" — body { background, color }, плюс опционально h1/h2/h3 { color }.

ПРИМЕРЫ:
Запрос: "сделай фон синим"
{"rules":[{"selector":"body","properties":{"background":"#1e3a8a","color":"#f8fafc"}}]}

Запрос: "кнопки круглые и больше"
{"rules":[{"selector":"button, .btn, a[role=\"button\"]","properties":{"border-radius":"9999px","padding":"14px 28px","font-size":"1.05rem"}}]}

Запрос: "в тёмную тему"
{"rules":[{"selector":"body","properties":{"background":"#0f172a","color":"#e2e8f0"}},{"selector":"h1, h2, h3","properties":{"color":"#f1f5f9"}},{"selector":"section","properties":{"background":"transparent"}}]}`;

/**
 * Сериализует список правил в CSS-текст с !important.
 */
export function rulesToCss(rules: CssRule[]): string {
  return rules
    .map((rule) => {
      const props = Object.entries(rule.properties)
        .map(([key, value]) => {
          // Не двойное !important если модель уже вставила
          const v = value.replace(/\s*!important\s*$/i, "").trim();
          return `  ${key}: ${v} !important;`;
        })
        .join("\n");
      return `${rule.selector} {\n${props}\n}`;
    })
    .join("\n\n");
}

/**
 * Инъектирует CSS в блок <style id="nit-overrides">.
 * Если блок уже есть — ДОПОЛНЯЕТ его (а не заменяет), чтобы последовательные
 * правки накапливались ("сделай фон синим" → затем "и кнопки жёлтые").
 * Если блока нет — вставляет перед </head>.
 * Если </head> нет — вставляет в начало <body>.
 */
export function injectCssOverrides(html: string, css: string): string {
  if (!css.trim()) return html;

  const existingBlock = /<style\s+id=["']nit-overrides["'][^>]*>([\s\S]*?)<\/style>/i;
  const match = html.match(existingBlock);

  if (match) {
    const existing = match[1] ?? "";
    const merged = `${existing.trim()}\n\n/* --- next patch --- */\n${css.trim()}`;
    return html.replace(
      existingBlock,
      `<style id="nit-overrides">\n${merged}\n</style>`,
    );
  }

  const styleBlock = `<style id="nit-overrides">\n${css.trim()}\n</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>\n${styleBlock}`);
  }

  // Последний fallback: в начало
  return `${styleBlock}\n${html}`;
}

/**
 * Генерирует CSS-патч через LLM без передачи всего HTML.
 * При успехе — возвращает объект с rules. При ошибке — throws (вызывающий код
 * решает, фолбэчиться ли на full_rewrite).
 */
export async function generateCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  signal?: AbortSignal;
}): Promise<CssPatch> {
  const { object } = await generateObject({
    model: params.model,
    schema: CssPatchSchema,
    system: CSS_PATCHER_SYSTEM,
    prompt: params.userRequest,
    temperature: 0.3,
    maxOutputTokens: 800,
    abortSignal: params.signal,
  });
  logger.info(
    SCOPE,
    `Generated CSS patch with ${object.rules.length} rule(s) for: ${params.userRequest.slice(0, 60)}`,
  );
  return object;
}

/**
 * Полный pipeline: сгенерить патч, сериализовать, инъектировать.
 */
export async function applyCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  currentHtml: string;
  signal?: AbortSignal;
}): Promise<{ html: string; css: string; ruleCount: number }> {
  const patch = await generateCssPatch({
    model: params.model,
    userRequest: params.userRequest,
    signal: params.signal,
  });
  const css = rulesToCss(patch.rules);
  const html = injectCssOverrides(params.currentHtml, css);
  return { html, css, ruleCount: patch.rules.length };
}
