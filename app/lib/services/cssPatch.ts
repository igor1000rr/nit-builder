/**
 * CSS-патч режим для Polisher.
 *
 * Когда юзер просит визуальную правку ("сделай фон синим", "увеличь заголовки"),
 * мы НЕ регенерируем весь HTML (6000-12000 output токенов). Вместо этого
 * просим модель выдать СПИСОК CSS-правил и инъектируем их в блок
 * <style id="nit-overrides"> в <head>. С !important они перебивают Tailwind-классы.
 *
 * Эффект по токенам: 6000+ → ~200. На порядок экономии в типичных правках.
 *
 * Section scoping: если запрос упоминает конкретные секции ("сделай hero синим"),
 * передаём targetSections и модель должна использовать селекторы
 * [data-nit-section="X"] ... вместо глобальных. Это делает правку точечной.
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
- Секции размечены атрибутом data-nit-section="<id>" (hero, about, pricing, ...).

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

function buildSectionScopedSystem(sections: string[]): string {
  const list = sections.join(", ");
  return `Ты — CSS-патчер. По запросу пользователя выдаёшь МИНИМАЛЬНЫЙ набор CSS-правил, перебивающих существующие стили.

КОНТЕКСТ:
- Сайт использует Tailwind CDN.
- Правила пойдут в <style id="nit-overrides"> в <head>.
- !important добавляется автоматически.
- Секции размечены data-nit-section="<id>".

ЖЁСТКОЕ ОГРАНИЧЕНИЕ — ТОЛЬКО ЭТИ СЕКЦИИ: ${list}
- Каждый селектор ДОЛЖЕН начинаться с [data-nit-section="X"] где X из списка выше.
- Селекторы без data-nit-section (body, section, h1) — ЗАПРЕЩЕНЫ.
- НЕ трогай остальные секции сайта.

ПРИНЦИПЫ:
1. Минимум правил (1-5).
2. Цвета — hex или rgb.
3. Только визуальные свойства. Никакой структуры или контента.

ПРИМЕРЫ:
Запрос: "сделай hero синим" (targets: hero)
{"rules":[{"selector":"[data-nit-section=\"hero\"]","properties":{"background":"#1e3a8a","color":"#f8fafc"}},{"selector":"[data-nit-section=\"hero\"] h1","properties":{"color":"#ffffff"}}]}

Запрос: "подсвети прайс жёлтым" (targets: pricing)
{"rules":[{"selector":"[data-nit-section=\"pricing\"]","properties":{"background":"#fef3c7"}},{"selector":"[data-nit-section=\"pricing\"] h2","properties":{"color":"#78350f"}}]}`;
}

/**
 * Сериализует список правил в CSS-текст с !important.
 */
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
 * Инъектирует CSS в блок <style id="nit-overrides">.
 * Дополняет существующий блок (не заменяет), чтобы правки накапливались.
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

  return `${styleBlock}\n${html}`;
}

/**
 * Генерирует CSS-патч через LLM без передачи HTML.
 * @param targetSections — если передан непустой массив, промпт ограничивает
 *   селекторы [data-nit-section="X"] из списка (точечная правка секции).
 */
export async function generateCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  targetSections?: string[];
  signal?: AbortSignal;
}): Promise<CssPatch> {
  const scoped = params.targetSections && params.targetSections.length > 0;
  const system = scoped
    ? buildSectionScopedSystem(params.targetSections!)
    : CSS_PATCHER_SYSTEM_GLOBAL;

  const prompt = scoped
    ? `ЦЕЛЕВЫЕ СЕКЦИИ: ${params.targetSections!.join(", ")}\n\nЗАПРОС: ${params.userRequest}`
    : params.userRequest;

  const { object } = await generateObject({
    model: params.model,
    schema: CssPatchSchema,
    system,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 800,
    abortSignal: params.signal,
  });

  logger.info(
    SCOPE,
    `Generated ${object.rules.length} rule(s) (${scoped ? "scoped" : "global"}) for: ${params.userRequest.slice(0, 60)}`,
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
  targetSections?: string[];
  signal?: AbortSignal;
}): Promise<{ html: string; css: string; ruleCount: number; scoped: boolean }> {
  const patch = await generateCssPatch({
    model: params.model,
    userRequest: params.userRequest,
    targetSections: params.targetSections,
    signal: params.signal,
  });
  const css = rulesToCss(patch.rules);
  const html = injectCssOverrides(params.currentHtml, css);
  return {
    html,
    css,
    ruleCount: patch.rules.length,
    scoped: (params.targetSections?.length ?? 0) > 0,
  };
}

/**
 * Извлекает список data-nit-section="X" из HTML. Используется orchestrator'ом
 * чтобы отфильтровать target sections которых нет в конкретном шаблоне.
 */
export function extractSectionsFromHtml(html: string): string[] {
  if (!html) return [];
  const sections = new Set<string>();
  const re = /data-nit-section\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) sections.add(m[1]);
  }
  return Array.from(sections);
}
