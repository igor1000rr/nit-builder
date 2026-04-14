/**
 * CSS-патч режим для Polisher.
 *
 * Поддерживает два scope'а:
 * - global: правила применяются ко всему документу (body, h1, button).
 * - section: правила автоматически префиксуются [data-nit-section="X"].
 *   Пример: "сделай героя синим" → [data-nit-section="hero"] { background: #1e3a8a }
 *
 * Section-scope двойное защита:
 *   1. System prompt инструктирует модель о префиксе
 *   2. Post-processing scopeRules() принудительно префиксует все селекторы
 * (если модель всё-таки вернёт глобальные — они автоматически ограничатся секцией).
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

const CSS_PATCHER_SYSTEM_GLOBAL = `Ты — CSS-патчер. По запросу пользователя выдаёшь МИНИМАЛЬНЫЙ набор CSS-правил, перебивающих существующие стили.

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

function buildSectionScopedSystem(sectionId: string): string {
  return `Ты — CSS-патчер с SECTION SCOPE. Все твои правила должны затрагивать ТОЛЬКО секцию "${sectionId}".

ФОРМАТ СЕЛЕКТОРОВ:
Каждый селектор ОБЯЗАТЕЛЬНО начинается с [data-nit-section="${sectionId}"].
- для всей секции: [data-nit-section="${sectionId}"]
- для заголовков в секции: [data-nit-section="${sectionId}"] h1, [data-nit-section="${sectionId}"] h2
- для кнопок в секции: [data-nit-section="${sectionId}"] button

!important добавляется автоматически.

ПРИМЕРЫ:
Запрос: "сделай героя синим" (sectionId=hero)
{"rules":[{"selector":"[data-nit-section=\"hero\"]","properties":{"background":"#1e3a8a","color":"#f8fafc"}}]}

Запрос: "в секции цен заголовки покрупнее" (sectionId=pricing)
{"rules":[{"selector":"[data-nit-section=\"pricing\"] h2, [data-nit-section=\"pricing\"] h3","properties":{"font-size":"2.5rem"}}]}

НЕ префиксуй body, html, * — никогда. Селектор должен строго начинаться с [data-nit-section="${sectionId}"].`;
}

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
 * Принудительно префиксует все селекторы [data-nit-section="X"].
 * Защита от случаев когда модель всё-таки вернула глобальный селектор вопреки промпту.
 *
 * Логика:
 * - если селектор уже содержит data-nit-section — не трогаем
 * - если селектор body/html/* — заменяем на сам префикс (граница секции)
 * - иначе — добавляем префикс к каждому селектору в comma-list
 */
export function scopeRules(rules: CssRule[], sectionId: string): CssRule[] {
  const prefix = `[data-nit-section="${sectionId}"]`;
  return rules.map((rule) => {
    if (rule.selector.includes("data-nit-section")) return rule;
    const parts = rule.selector
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const scoped = parts.map((s) => {
      const lower = s.toLowerCase();
      if (lower === "body" || lower === "html" || lower === "*") return prefix;
      return `${prefix} ${s}`;
    });
    return { selector: scoped.join(", "), properties: rule.properties };
  });
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
  sectionId?: string;
  signal?: AbortSignal;
}): Promise<CssPatch> {
  const system = params.sectionId
    ? buildSectionScopedSystem(params.sectionId)
    : CSS_PATCHER_SYSTEM_GLOBAL;

  const { object } = await generateObject({
    model: params.model,
    schema: CssPatchSchema,
    system,
    prompt: params.userRequest,
    temperature: 0.3,
    maxOutputTokens: 800,
    abortSignal: params.signal,
  });
  logger.info(
    SCOPE,
    `Generated CSS patch: ${object.rules.length} rule(s), scope=${params.sectionId ?? "global"}, request="${params.userRequest.slice(0, 60)}"`,
  );
  return object;
}

export async function applyCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  currentHtml: string;
  sectionId?: string;
  signal?: AbortSignal;
}): Promise<{ html: string; css: string; ruleCount: number; scope: "global" | "section"; sectionId?: string }> {
  const patch = await generateCssPatch({
    model: params.model,
    userRequest: params.userRequest,
    sectionId: params.sectionId,
    signal: params.signal,
  });

  const rules = params.sectionId ? scopeRules(patch.rules, params.sectionId) : patch.rules;
  const css = rulesToCss(rules);
  const html = injectCssOverrides(params.currentHtml, css);
  return {
    html,
    css,
    ruleCount: rules.length,
    scope: params.sectionId ? "section" : "global",
    sectionId: params.sectionId,
  };
}
