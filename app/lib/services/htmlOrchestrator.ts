import { streamText, generateText, generateObject } from "ai";
import { PlanSchema, extractPlanJson, type Plan } from "~/lib/utils/planSchema";
import {
  buildPlannerSystemPrompt,
  buildPlannerPrompt,
  CODER_SYSTEM_PROMPT,
  buildCoderUserMessage,
  POLISHER_SYSTEM_PROMPT,
  buildPolisherUserMessage,
} from "~/lib/config/htmlPrompts";
import {
  getTemplateById,
  getFallbackTemplate,
} from "~/lib/config/htmlTemplatesCatalog";
import { loadTemplateHtmlForLlm } from "~/lib/config/htmlTemplates.server";
import {
  getPreferredProvider,
  getModel,
  calcMaxOutput,
  calcCoderMaxOutput,
  checkContextBudget,
} from "~/lib/llm/client";
import { sanitizeUserMessage } from "~/lib/utils/promptSanitizer";
import { updateSessionHtml, type SessionMemory } from "~/lib/services/sessionMemory";
import { logger } from "~/lib/utils/logger";
import { metrics } from "~/lib/services/metrics";
import { repairTruncatedHtml } from "~/lib/utils/htmlRepair";
import { getCachedPlan, setCachedPlan } from "~/lib/services/planCache";
import { classifyPolishIntent, type PolishIntent } from "~/lib/services/intentClassifier";
import { applyCssPatch } from "~/lib/services/cssPatch";

const SCOPE = "htmlOrchestrator";

// Stop sequences для streamText. Обрезает хвост вида "Готово! Я создал..."
// после </html> — экономит 50-200 output токенов на каждой генерации.
const HTML_STOP_SEQUENCES = ["</html>", "```\n\n", "\n```"];

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "plan_ready"; plan: Plan; cached?: boolean }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "text"; text: string }
  | { type: "step_complete"; html?: string }
  | { type: "polish_mode"; intent: PolishIntent; reason: string }
  | { type: "css_patch_applied"; ruleCount: number; css: string }
  | { type: "error"; message: string };

export type OrchestratorOptions = {
  /** Model name override (provider всегда lmstudio — облачные удалены) */
  providerOverride?: { modelName?: string };
  /** Принудительно пропустить кеш планов (для отладки и тестов) */
  skipPlanCache?: boolean;
  /** Принудительный режим polish (обход классификатора) */
  polishIntent?: PolishIntent;
};

function stripCodeFences(text: string): string {
  // Если стрим оборвался на stop-sequence "</html>" — добавляем тег обратно.
  let working = text;
  if (!/<\/html>/i.test(working) && /<html[\s>]/i.test(working)) {
    working = `${working}\n</html>`;
  }

  const doctypeMatch = working.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  let extracted = doctypeMatch?.[0];

  if (!extracted) {
    const htmlMatch = working.match(/<html[\s\S]*?<\/html>/i);
    extracted = htmlMatch?.[0];
  }

  if (!extracted) {
    extracted = working
      .replace(/^```html\s*/im, "")
      .replace(/^```\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
  }

  const cleaned = extracted
    .replace(/\s*<!--\s*═══\s*SECTION:[^>]*-->\s*/g, "\n")
    .replace(/\s*<!--\s*═══\s*END\s+SECTION\s*═══\s*-->\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return repairTruncatedHtml(cleaned);
}

async function obtainPlan(
  model: ReturnType<typeof getModel>,
  sanitizedMessage: string,
  signal: AbortSignal,
  skipCache: boolean,
): Promise<{ plan: Plan; cached: boolean }> {
  if (!skipCache) {
    const cached = getCachedPlan(sanitizedMessage);
    if (cached) {
      logger.info(SCOPE, `Plan cache hit for: ${sanitizedMessage.slice(0, 60)}`);
      return { plan: cached, cached: true };
    }
  }

  try {
    const { object } = await generateObject({
      model,
      schema: PlanSchema,
      system: buildPlannerSystemPrompt(),
      prompt: sanitizedMessage,
      temperature: 0.3,
      abortSignal: signal,
      maxOutputTokens: 1500,
    });
    setCachedPlan(sanitizedMessage, object);
    return { plan: object, cached: false };
  } catch (structErr) {
    if ((structErr as Error).name === "AbortError") throw structErr;
    logger.warn(
      SCOPE,
      `generateObject failed (${(structErr as Error).message}), fallback to generateText`,
    );
  }

  try {
    const { text: planRaw } = await generateText({
      model,
      system: buildPlannerPrompt(),
      prompt: sanitizedMessage,
      maxOutputTokens: 1500,
      temperature: 0.3,
      abortSignal: signal,
    });

    let rawJson: unknown = null;
    try {
      rawJson = extractPlanJson(planRaw);
    } catch (parseErr) {
      logger.warn(SCOPE, `Plan JSON extract failed: ${(parseErr as Error).message}`);
    }

    const parsed = rawJson !== null ? PlanSchema.safeParse(rawJson) : null;
    if (parsed?.success) {
      setCachedPlan(sanitizedMessage, parsed.data);
      return { plan: parsed.data, cached: false };
    }
    logger.warn(SCOPE, "Plan schema validation failed, using fallback plan");
  } catch (genErr) {
    if ((genErr as Error).name === "AbortError") throw genErr;
    logger.warn(SCOPE, `Fallback generateText failed: ${(genErr as Error).message}`);
  }

  const synthetic: Plan = {
    business_type: sanitizedMessage.slice(0, 100) || "универсальный сайт",
    target_audience: "",
    tone: "профессиональный",
    style_hints: "",
    color_mood: "light-minimal",
    sections: ["hero", "about", "features", "contact"],
    keywords: [],
    cta_primary: "Связаться",
    language: "ru",
    suggested_template_id: "blank-landing",
  };
  return { plan: synthetic, cached: false };
}

export async function* executeHtmlSimple(
  memory: SessionMemory,
  userMessage: string,
  signal: AbortSignal,
  options: OrchestratorOptions = {},
): AsyncGenerator<PipelineEvent> {
  const provider = getPreferredProvider(options.providerOverride);
  if (!provider) {
    yield {
      type: "error",
      message: "Нет доступного LLM провайдера. Запусти LM Studio с загруженной моделью (по умолчанию http://localhost:1234).",
    };
    return;
  }

  const sanitized = sanitizeUserMessage(userMessage);
  const model = getModel(provider);
  const startMs = Date.now();
  metrics.generationStarted("create", provider.id);

  yield {
    type: "step_start",
    roleName: "Планировщик",
    model: provider.defaultModel,
    provider: provider.id,
  };

  let plan: Plan;
  let planCached = false;
  try {
    const obtained = await obtainPlan(model, sanitized, signal, options.skipPlanCache ?? false);
    plan = obtained.plan;
    planCached = obtained.cached;
    memory.planJson = plan;
    yield { type: "plan_ready", plan, cached: planCached };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("create", "planner_error");
    yield { type: "error", message: `Ошибка планировщика: ${(err as Error).message}` };
    return;
  }

  const template = getTemplateById(plan.suggested_template_id) ?? getFallbackTemplate();
  const templateHtml = loadTemplateHtmlForLlm(template.id);
  memory.templateId = template.id;

  yield { type: "template_selected", templateId: template.id, templateName: template.name };
  metrics.templateSelected(template.id);

  yield {
    type: "step_start",
    roleName: "Кодер",
    model: provider.defaultModel,
    provider: provider.id,
  };

  try {
    const planJsonStr = JSON.stringify(plan);
    const estimatedInputChars =
      templateHtml.length + planJsonStr.length + CODER_SYSTEM_PROMPT.length + 200;
    const budget = checkContextBudget(provider, estimatedInputChars, 8000);
    if (budget.warning) logger.warn(SCOPE, budget.warning);
    if (!budget.ok) {
      metrics.generationFailed("create", "context_overflow");
      yield { type: "error", message: budget.warning ?? "Context overflow" };
      return;
    }

    const maxOutput = calcCoderMaxOutput(
      provider,
      templateHtml.length,
      planJsonStr.length,
      CODER_SYSTEM_PROMPT.length,
    );

    const result = await streamText({
      model,
      system: CODER_SYSTEM_PROMPT,
      prompt: buildCoderUserMessage({ templateHtml, plan }),
      maxOutputTokens: maxOutput,
      temperature: 0.4,
      stopSequences: HTML_STOP_SEQUENCES,
      abortSignal: signal,
    });

    let fullHtml = "";
    for await (const delta of result.textStream) {
      fullHtml += delta;
      yield { type: "text", text: delta };
    }

    fullHtml = stripCodeFences(fullHtml);
    memory.currentHtml = fullHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, fullHtml);
    metrics.generationCompleted("create", provider.id, Date.now() - startMs);
    yield { type: "step_complete", html: fullHtml };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("create", "coder_error");
    yield { type: "error", message: `Ошибка кодера: ${(err as Error).message}` };
  }
}

export async function* executeHtmlPolish(
  memory: SessionMemory,
  userRequest: string,
  signal: AbortSignal,
  options: OrchestratorOptions = {},
): AsyncGenerator<PipelineEvent> {
  if (!memory.currentHtml) {
    yield { type: "error", message: "Нет HTML для правки. Сначала создай сайт." };
    return;
  }

  const provider = getPreferredProvider(options.providerOverride);
  if (!provider) {
    yield { type: "error", message: "Нет доступного LLM провайдера. Запусти LM Studio." };
    return;
  }

  const model = getModel(provider);
  const startMs = Date.now();
  const sanitizedRequest = sanitizeUserMessage(userRequest);

  // Классификация намерения — эвристика 0ms.
  const classification = options.polishIntent
    ? { intent: options.polishIntent, reason: "user override" }
    : (() => {
        const c = classifyPolishIntent(sanitizedRequest);
        return { intent: c.intent, reason: c.reason };
      })();

  yield { type: "polish_mode", intent: classification.intent, reason: classification.reason };

  // ─── CSS PATCH PATH (дешёвый, ~200 токенов вместо ~6000) ───
  if (classification.intent === "css_patch") {
    metrics.generationStarted("polish", provider.id);
    yield {
      type: "step_start",
      roleName: "CSS-Патчер",
      model: provider.defaultModel,
      provider: provider.id,
    };

    try {
      const result = await applyCssPatch({
        model,
        userRequest: sanitizedRequest,
        currentHtml: memory.currentHtml,
        signal,
      });

      memory.currentHtml = result.html;
      memory.updatedAt = Date.now();
      updateSessionHtml(memory.sessionId, result.html);
      metrics.generationCompleted("polish", provider.id, Date.now() - startMs);

      yield { type: "css_patch_applied", ruleCount: result.ruleCount, css: result.css };
      yield { type: "step_complete", html: result.html };
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      logger.warn(
        SCOPE,
        `CSS patch failed (${(err as Error).message}), falling back to full rewrite`,
      );
      // Грейсфул фолбэк на full rewrite ниже.
    }
  }

  // ─── FULL REWRITE PATH ───
  metrics.generationStarted("polish", provider.id);
  yield {
    type: "step_start",
    roleName: "Полировщик",
    model: provider.defaultModel,
    provider: provider.id,
  };

  try {
    const estimatedInputChars =
      memory.currentHtml.length + sanitizedRequest.length + POLISHER_SYSTEM_PROMPT.length + 200;
    const maxOutput = calcMaxOutput(provider, estimatedInputChars);

    const result = await streamText({
      model,
      system: POLISHER_SYSTEM_PROMPT,
      prompt: buildPolisherUserMessage({
        currentHtml: memory.currentHtml,
        userRequest: sanitizedRequest,
      }),
      maxOutputTokens: maxOutput,
      temperature: 0.3,
      stopSequences: HTML_STOP_SEQUENCES,
      abortSignal: signal,
    });

    let fullHtml = "";
    for await (const delta of result.textStream) {
      fullHtml += delta;
      yield { type: "text", text: delta };
    }

    fullHtml = stripCodeFences(fullHtml);
    memory.currentHtml = fullHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, fullHtml);
    metrics.generationCompleted("polish", provider.id, Date.now() - startMs);
    yield { type: "step_complete", html: fullHtml };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("polish", "polisher_error");
    yield { type: "error", message: `Ошибка полировщика: ${(err as Error).message}` };
  }
}
