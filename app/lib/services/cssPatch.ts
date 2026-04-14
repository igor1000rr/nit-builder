/**
 * CSS-патч режим для Polisher.
 *
 * Когда юзер просит визуальную правку, мы НЕ регенерируем весь HTML.
 * Вместо этого просим модель выдать СПИСОК CSS-правил и инъектируем их
 * в <style id="nit-overrides">. С !important перебивают Tailwind.
 *
 * Context-aware: передаём дайджест текущего дизайна (~300 chars) чтобы модель
 * знала какие секции имеют градиенты (их надо перебивать background-image).
 *
 * Section scoping: если targetSections передан, модель обязана использовать
 * только [data-nit-section="X"] селекторы.
 */

import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { logger } from "~/lib/utils/logger";
import { buildHtmlDigest, digestToPromptSnippet } from "~/lib/utils/htmlDigest";

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

const BASE_RULES = `ПРИНЦИПЫ:
1. Минимум правил. 1-5 для типичного запроса.
2. Цвета — hex (#3b82f6) или rgb(). Избегай hsl.
3. !important добавляется автоматически — ТЫ ЕГО НЕ ПИШЕШЬ.
4. Только визуальные свойства. Никакой структуры/текста/контента.
5. Если секция имеет [градиент] в текущем дизайне — для смены фона пиши
   background-image: none вместе с background-color. Иначе gradient перебьёт.`;

const GLOBAL_EXAMPLES = `ПРИМЕРЫ:
Запрос: "сделай фон синим"
{"rules":[{"selector":"body","properties":{"background":"#1e3a8a","color":"#f8fafc"}}]}

Запрос: "кнопки круглые и больше"
{"rules":[{"selector":"button, .btn, a[role=\"button\"]","properties":{"border-radius":"9999px","padding":"14px 28px","font-size":"1.05rem"}}]}

Запрос: "в тёмную тему"
{"rules":[{"selector":"body","properties":{"background":"#0f172a","color":"#e2e8f0"}},{"selector":"h1, h2, h3","properties":{"color":"#f1f5f9"}}]}`;

function buildGlobalSystem(digestSnippet: string): string {
  const contextBlock = digestSnippet
    ? `\n\n${digestSnippet}\nИспользуй эту информацию чтобы правильно перебить Tailwind-классы.`
    : "";
  return `Ты — CSS-патчер. По запросу юзера выдаёшь МИНИМАЛЬНЫЙ набор CSS-правил, перебивающих существующие стили.

КОНТЕКСТ:
- Сайт на Tailwind CDN (классы bg-*, text-*, p-*, font-*).
- Правила пойдут в <style id="nit-overrides"> в <head>.
- Секции размечены data-nit-section="<id>".${contextBlock}

${BASE_RULES}
6. Широкие селекторы: body, h1, h2, h3, button, a, section.
7. Для фона сайта — body. Для отдельных секций — [data-nit-section="X"].

${GLOBAL_EXAMPLES}`;
}

function buildScopedSystem(sections: string[], digestSnippet: string): string {
  const list = sections.join(", ");
  const contextBlock = digestSnippet
    ? `\n\n${digestSnippet}\nИспользуй это чтобы понять какие свойства перебивать.`
    : "";
  return `Ты — CSS-патчер. По запросу юзера выдаёшь МИНИМАЛЬНЫЙ набор CSS-правил.

КОНТЕКСТ:
- Tailwind CDN, блок правил в <style id="nit-overrides">.
- Секции размечены data-nit-section="<id>".${contextBlock}

ЖЁСТКОЕ ОГРАНИЧЕНИЕ — ТОЛЬКО ЭТИ СЕКЦИИ: ${list}
- Каждый селектор НАЧИНАЕТСЯ с [data-nit-section="X"] где X из списка выше.
- Селекторы без data-nit-section (body, section, h1) — ЗАПРЕЩЕНЫ.
- Не трогай остальные секции сайта.

${BASE_RULES}

ПРИМЕРЫ:
Запрос: "сделай hero синим" (targets: hero)
{"rules":[{"selector":"[data-nit-section=\"hero\"]","properties":{"background":"#1e3a8a","background-image":"none","color":"#f8fafc"}},{"selector":"[data-nit-section=\"hero\"] h1","properties":{"color":"#ffffff"}}]}

Запрос: "подсвети прайс жёлтым" (targets: pricing)
{"rules":[{"selector":"[data-nit-section=\"pricing\"]","properties":{"background":"#fef3c7"}},{"selector":"[data-nit-section=\"pricing\"] h2","properties":{"color":"#78350f"}}]}`;
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
 * Генерирует CSS-патч с context-aware промптом.
 *
 * @param currentHtml — текущий HTML сайта. Из него строится дайджест визуальных
 *   классов (не весь HTML — сэкономлено ~95% токенов). Опционален —
 *   без HTML работает в старом "context-free" режиме.
 * @param targetSections — сцоп правки. Если передан непустой — селекторы
 *   [data-nit-section="X"], иначе глобальные.
 */
export async function generateCssPatch(params: {
  model: LanguageModel;
  userRequest: string;
  currentHtml?: string;
  targetSections?: string[];
  signal?: AbortSignal;
}): Promise<CssPatch> {
  const scoped = (params.targetSections?.length ?? 0) > 0;

  const digest = params.currentHtml ? buildHtmlDigest(params.currentHtml) : null;
  const digestSnippet = digest
    ? digestToPromptSnippet(digest, scoped ? params.targetSections : undefined)
    : "";

  const system = scoped
    ? buildScopedSystem(params.targetSections!, digestSnippet)
    : buildGlobalSystem(digestSnippet);

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
    `Generated ${object.rules.length} rule(s) (${scoped ? "scoped" : "global"}, digest=${digestSnippet ? "yes" : "no"}) for: ${params.userRequest.slice(0, 60)}`,
  );
  return object;
}

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
    currentHtml: params.currentHtml,
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
