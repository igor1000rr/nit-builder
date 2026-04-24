/**
 * CSS-патч режим для Polisher (+ section-scoping).
 *
 * Когда юзер просит визуальную правку мы генерим CSS-рулсы вместо регенерации
 * всего HTML. Если запрос адресован конкретной секции ("сделай героя синим") —
 * селекторы скопируются в [data-nit-section="hero"] чтобы не зацепить соседей.
 */

import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { logger } from "~/lib/utils/logger";

const SCOPE = "cssPatch";

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
- Сайт использует Tailwind CDN.
- Твои правила пойдут в <style id="nit-overrides"> в <head>.
- !important добавляется автоматически ко всем свойствам — ты его НЕ пишешь.

ПРИНЦИПЫ:
1. Минимум правил. 1-5 правил для типичного запроса.
2. Широкие селекторы: body, h1, h2, h3, button, a, section, .hero, .pricing.
3. Цвета — hex (#3b82f6) или rgb(). Избегай hsl без необходимости.
4. Для фона сайта — селектор body. Для секций — section или .hero/.pricing/etc.
5. НЕ пытайся менять структуру, текст или контент — только визуальные свойства.
6. Для "тёмной темы" — body { background, color }, плюс опционально h1/h2/h3 { color }.

ПРИМЕРЫ:
Запрос: "сделай фон синим"
{"rules":[{"selector":"body","properties":{"background":"#1e3a8a","color":"#f8fafc"}}]}

Запрос: "кнопки круглые и больше"
{"rules":[{"selector":"button, .btn, a[role='button']","properties":{"border-radius":"9999px","padding":"14px 28px","font-size":"1.05rem"}}]}

Запрос: "в тёмную тему"
{"rules":[{"selector":"body","properties":{"background":"#0f172a","color":"#e2e8f0"}},{"selector":"h1, h2, h3","properties":{"color":"#f1f5f9"}},{"selector":"section","properties":{"background":"transparent"}}]}`;

export function rulesToCss(rules: CssRule[]): string {
  return rules
    .map((rule) => {
      const props = Object.entries(rule.properties)
        .map(([key, value]) => {
          const v = value.replace(/\s*!important\s*$/i, "").trim();
          return `  ${key}: ${v} !important;`;
        })
        .join("\n");
      return `${rule.selector} {\n${props}\n}`;
    })
    .join("\n\n");
}

/**
 * Скопировать CSS-селектор в [data-nit-section="X"] для точечных правок.
 *
 * "body" → [data-nit-section="hero"]
 * "h1" → [data-nit-section="hero"] h1
 * ".btn, button" → [data-nit-section="hero"] .btn, [data-nit-section="hero"] button
 * "html" → "html" (не имеет смысла скоупить)
 * селектор уже содержит этот scope — не трогаем.
 */
export function scopeSelector(selector: string, sectionId: string): string {
  const scope = `[data-nit-section="${sectionId}"]`;

  return selector
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      if (trimmed.includes(`data-nit-section="${sectionId}"`)) return trimmed;
      if (/^html(\b|$)/i.test(trimmed)) return trimmed;
      if (/^body(\b|$)/i.test(trimmed)) {
        return trimmed.replace(/^body/, scope);
      }
      return `${scope} ${trimmed}`;
    })
    .filter(Boolean)
    .join(", ");
}

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

  return `${styleBlock}\n${html}`;
}

export async function generateCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  targetSection?: string;
  signal?: AbortSignal;
}): Promise<CssPatch> {
  // Если есть target — добавляем подсказку в promt на уровне контекста.
  // Модель продолжает писать широкие селекторы (h1, button) — скоуп добавим мы программно.
  const promptSuffix = params.targetSection
    ? `\n\n(Кстати: правка адресована только секции "${params.targetSection}" — не пиши body, пиши просто h1/h2/button/p/section/etc.)`
    : "";

  const { object } = await generateObject({
    model: params.model,
    schema: CssPatchSchema,
    system: CSS_PATCHER_SYSTEM,
    prompt: `${params.userRequest}${promptSuffix}`,
    temperature: 0.3,
    maxOutputTokens: 800,
    abortSignal: params.signal,
  });
  logger.info(
    SCOPE,
    `Generated CSS patch with ${object.rules.length} rule(s)` +
      (params.targetSection ? ` [scoped: ${params.targetSection}]` : "") +
      ` for: ${params.userRequest.slice(0, 60)}`,
  );
  return object;
}

export async function applyCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  currentHtml: string;
  targetSection?: string;
  signal?: AbortSignal;
}): Promise<{ html: string; css: string; ruleCount: number; scoped: boolean }> {
  const patch = await generateCssPatch({
    model: params.model,
    userRequest: params.userRequest,
    targetSection: params.targetSection,
    signal: params.signal,
  });

  const scopedRules = params.targetSection
    ? patch.rules.map((r) => ({
        ...r,
        selector: scopeSelector(r.selector, params.targetSection!),
      }))
    : patch.rules;

  const css = rulesToCss(scopedRules);
  const html = injectCssOverrides(params.currentHtml, css);
  return {
    html,
    css,
    ruleCount: scopedRules.length,
    scoped: Boolean(params.targetSection),
  };
}
