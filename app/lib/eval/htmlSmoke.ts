import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executeHtmlSimple } from "~/lib/services/htmlOrchestrator";
import { getOrCreateSession } from "~/lib/services/sessionMemory";
import type { Plan } from "~/lib/utils/planSchema";

export type HtmlSmokeCase = {
  id: string;
  prompt: string;
  relevantAny: string[];
  ctaAny: string[];
  expectedTemplateAny?: string[];
};

export type HtmlSmokeCheck = {
  name: string;
  passed: boolean;
  detail?: string;
};

export type HtmlSmokeCaseResult = {
  id: string;
  prompt: string;
  passed: boolean;
  durationMs: number;
  templateId: string;
  planTemplateId?: string;
  sections?: string[];
  ctaPrimary?: string;
  htmlChars: number;
  outputFile: string;
  events: Record<string, number>;
  checks: HtmlSmokeCheck[];
  warnings: string[];
  error?: string;
};

export type HtmlSmokeRunReport = {
  runId: string;
  startedAt: number;
  finishedAt: number;
  modelName?: string;
  outputDir: string;
  summary: {
    total: number;
    passed: number;
    passRate: number;
    meanLatencyMs: number;
  };
  cases: HtmlSmokeCaseResult[];
};

export const DEFAULT_HTML_SMOKE_CASES: HtmlSmokeCase[] = [
  {
    id: "coffee-premium",
    prompt:
      "элитная спешелти-кофейня с обжарщиком в зале, cupping-сессиями, меню и бронью столика",
    relevantAny: ["кофе", "спешелти", "cupping", "обжар"],
    ctaAny: ["заброни", "бронь", "столик"],
    expectedTemplateAny: ["coffee-shop"],
  },
  {
    id: "kids-center",
    prompt:
      "детский развивающий центр робототехника творчество и подготовка к школе, программы и цены",
    relevantAny: ["детск", "робот", "творч", "программ"],
    ctaAny: ["запис", "пробн", "остав"],
  },
  {
    id: "nutrition",
    prompt:
      "нутрициолог онлайн консультации, КБЖУ, планы питания, анализы и запись на консультацию",
    relevantAny: ["нутрициолог", "питани", "КБЖУ", "анализ"],
    ctaAny: ["запис", "консультац", "остав"],
  },
  {
    id: "tattoo",
    prompt: "тату студия realism blackwork эскизы галерея мастера и запись на сеанс",
    relevantAny: ["тату", "realism", "blackwork", "эскиз"],
    ctaAny: ["запис", "сеанс", "консультац"],
    expectedTemplateAny: ["tattoo-studio"],
  },
  {
    id: "pottery",
    prompt:
      "мастер-класс по гончарному делу на двоих романтический вечер за 2 часа цена и запись",
    relevantAny: ["гончар", "керамик", "мастер-класс", "двоих"],
    ctaAny: ["запис", "мастер-класс", "заброни"],
  },
  {
    id: "translation",
    prompt:
      "медицинский перевод документов для лечения в Германии и Израиле, услуги и консультация",
    relevantAny: ["перевод", "медицин", "Германи", "Израил"],
    ctaAny: ["консультац", "остав", "связ"],
    expectedTemplateAny: ["blank-landing"],
  },
  {
    id: "beauty",
    prompt:
      "салон красоты премиум сегмент стрижка окрашивание цены режим работы телефон",
    relevantAny: ["салон", "красот", "стриж", "окраш"],
    ctaAny: ["запис", "позвон", "консультац"],
    expectedTemplateAny: ["beauty-master"],
  },
  {
    id: "saas-edtech",
    prompt:
      "edtech платформа для языковых школ управление учениками расписанием тарифы FAQ",
    relevantAny: ["edtech", "школ", "ученик", "распис"],
    ctaAny: ["демо", "попроб", "остав", "тариф"],
    expectedTemplateAny: ["saas-landing"],
  },
];

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSection(html: string, sectionId: string): string {
  const re = new RegExp(`<section[^>]*id=["']${sectionId}["'][^>]*>[\\s\\S]*?<\\/section>`, "i");
  return html.match(re)?.[0] ?? "";
}

function extractHeroPrimaryCta(heroHtml: string): string {
  const anchor = heroHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
  return stripTags(anchor);
}

export function analyzeHtmlSmokeCase(params: {
  smokeCase: HtmlSmokeCase;
  html: string;
  templateId: string;
  plan?: Plan | null;
  outputFile: string;
  durationMs: number;
  events: Record<string, number>;
  error?: string;
}): HtmlSmokeCaseResult {
  const { smokeCase, html, templateId, plan, outputFile, durationMs, events, error } = params;
  const text = stripTags(html);
  const hero = extractSection(html, "hero");
  const heroText = stripTags(hero);
  const heroCta = extractHeroPrimaryCta(hero);
  const checks: HtmlSmokeCheck[] = [
    { name: "no_error", passed: !error, detail: error },
    { name: "has_doctype", passed: html.includes("<!DOCTYPE html>") },
    { name: "has_html_tag", passed: /<html[\s>]/i.test(html) },
    { name: "has_head", passed: /<head[\s>]/i.test(html) },
    { name: "has_body", passed: /<body[\s>]/i.test(html) },
    { name: "has_title", passed: /<title[\s>][\s\S]*<\/title>/i.test(html) },
    { name: "has_css", passed: /<style|class=/i.test(html) },
    { name: "size_ok", passed: html.length >= 3000, detail: `${html.length} chars` },
    { name: "relevant_copy", passed: includesAny(text, smokeCase.relevantAny) },
    { name: "hero_exists", passed: hero.length > 0 },
    { name: "hero_has_h1", passed: /<h1\b/i.test(hero) },
    {
      name: "hero_cta_matches_intent",
      passed: includesAny(heroCta, smokeCase.ctaAny),
      detail: heroCta ? `hero CTA: ${heroCta}` : "hero CTA missing",
    },
    {
      name: "page_cta_matches_intent",
      passed: includesAny(text, smokeCase.ctaAny),
    },
    { name: "no_code_fences", passed: !html.includes("```") },
    { name: "no_section_markers", passed: !/SECTION:|═══/.test(html) },
  ];

  if (smokeCase.expectedTemplateAny?.length) {
    checks.push({
      name: "template_expected",
      passed: smokeCase.expectedTemplateAny.includes(templateId),
      detail: `template=${templateId}`,
    });
  }

  const warnings: string[] = [];
  if (/\bBrand\b|🌟 Brand|Bean & Brew/.test(heroText)) {
    warnings.push("generic brand text remains in hero");
  }
  if (!/<img\b|<svg\b|background-image|unsplash/i.test(hero)) {
    warnings.push("hero has no obvious visual element");
  }

  return {
    id: smokeCase.id,
    prompt: smokeCase.prompt,
    passed: checks.every((check) => check.passed),
    durationMs,
    templateId,
    planTemplateId: plan?.suggested_template_id,
    sections: plan?.sections,
    ctaPrimary: plan?.cta_primary,
    htmlChars: html.length,
    outputFile,
    events,
    checks,
    warnings,
    error,
  };
}

export async function runHtmlSmokeSuite(params: {
  cases?: HtmlSmokeCase[];
  outputDir: string;
  modelName?: string;
  runId?: string;
}): Promise<HtmlSmokeRunReport> {
  const startedAt = Date.now();
  const runId = params.runId ?? `html_smoke_${startedAt}`;
  const cases = params.cases ?? DEFAULT_HTML_SMOKE_CASES;
  const outputDir = join(params.outputDir, runId);
  await mkdir(outputDir, { recursive: true });

  const results: HtmlSmokeCaseResult[] = [];

  for (const smokeCase of cases) {
    const session = getOrCreateSession(`${runId}-${smokeCase.id}`, `html-smoke-${smokeCase.id}`);
    const caseStart = Date.now();
    const events: Record<string, number> = {};
    let html = "";
    let plan: Plan | null = null;
    let templateId = "";
    let error: string | undefined;

    try {
      for await (const event of executeHtmlSimple(
        session,
        smokeCase.prompt,
        new AbortController().signal,
        {
          providerOverride: params.modelName ? { modelName: params.modelName } : undefined,
          skipPlanCache: true,
        },
      )) {
        events[event.type] = (events[event.type] ?? 0) + 1;
        if (event.type === "plan_ready") plan = event.plan;
        if (event.type === "template_selected") templateId = event.templateId;
        if (event.type === "step_complete") html = event.html ?? "";
        if (event.type === "error") error = event.message;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const outputFile = join(outputDir, `${smokeCase.id}.html`);
    await writeFile(outputFile, html, "utf8");
    results.push(analyzeHtmlSmokeCase({
      smokeCase,
      html,
      templateId,
      plan,
      outputFile,
      durationMs: Date.now() - caseStart,
      events,
      error,
    }));
  }

  const finishedAt = Date.now();
  const passed = results.filter((result) => result.passed).length;
  const meanLatencyMs = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / results.length)
    : 0;
  const report: HtmlSmokeRunReport = {
    runId,
    startedAt,
    finishedAt,
    modelName: params.modelName,
    outputDir,
    summary: {
      total: results.length,
      passed,
      passRate: results.length ? Number((passed / results.length).toFixed(3)) : 0,
      meanLatencyMs,
    },
    cases: results,
  };

  await writeFile(join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}
