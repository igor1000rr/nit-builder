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
- Если в запросе упомянута конкретная секция (герой, меню, цены) — scope добавляется автоматически, ты пишешь обычные селекторы (h1, p, button, .title).

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
{"rules":[{"selector":"button, .btn, a[role=\"button\"]","properties":{"border-radius":"9999px","padding":"14px 28px","font-size":"1.05rem"}}]}

Запрос: "в тёмную тему"
{"rules":[{"selector":"body","properties":{"background":"#0f172a","color":"#e2e8f0"}},{"selector":"h1, h2, h3","properties":{"color":"#f1f5f9"}},{"selector":"section","properties":{"background":"transparent"}}]}`;

function scopeOneSelector(raw: string, scope: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // body/html при scope заменяются на сам scope (иначе "[data-...] body" — бессмысленно)
  if (/^(body|html)$/i.test(trimmed)) return scope;
  // Если уже начинается с scope — не дублируем
  if (trimmed.startsWith(scope)) return trimmed;
  return `${scope} ${trimmed}`;
}

function scopeSelector(selector: string, scope: string): string {
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => scopeOneSelector(s, scope))
    .join(", ");
}

export function rulesToCss(rules: CssRule[], scope?: string): string {
  return rules
    .map((rule) => {
      const finalSelector = scope ? scopeSelector(rule.selector, scope) : rule.selector;
      const props = Object.entries(rule.properties)
        .map(([key, value]) => {
          const v = value.replace(/\s*!important\s*$/i, "").trim();
          return `  ${key}: ${v} !important;`;
        })
        .join("\n");
      return `${finalSelector} {\n${props}\n}`;
    })
    .join("\n\n");
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
  targetSection?: string | null;
  signal?: AbortSignal;
}): Promise<CssPatch> {
  const prompt = params.targetSection
    ? `Целевая секция: ${params.targetSection} (scope добавится автоматически, пиши обычные селекторы).\nЗапрос: ${params.userRequest}`
    : params.userRequest;

  const { object } = await generateObject({
    model: params.model,
    schema: CssPatchSchema,
    system: CSS_PATCHER_SYSTEM,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 800,
    abortSignal: params.signal,
  });
  logger.info(
    SCOPE,
    `Generated CSS patch with ${object.rules.length} rule(s)${params.targetSection ? ` (scoped to ${params.targetSection})` : ""} for: ${params.userRequest.slice(0, 60)}`,
  );
  return object;
}

export async function applyCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  currentHtml: string;
  targetSection?: string | null;
  signal?: AbortSignal;
}): Promise<{ html: string; css: string; ruleCount: number; scope: string | null }> {
  const patch = await generateCssPatch({
    model: params.model,
    userRequest: params.userRequest,
    targetSection: params.targetSection,
    signal: params.signal,
  });
  const scope = params.targetSection
    ? `[data-nit-section="${params.targetSection}"]`
    : null;
  const css = rulesToCss(patch.rules, scope ?? undefined);
  const html = injectCssOverrides(params.currentHtml, css);
  return { html, css, ruleCount: patch.rules.length, scope };
}
