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
import { retrieveTemplates } from "~/lib/services/templateRetriever";
import { enrichSectionAnchors } from "~/lib/utils/sectionAnchors";

const SCOPE = "htmlOrchestrator";

const HTML_STOP_SEQUENCES = ["</html>", "```\n\n", "\n```"];

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "plan_ready"; plan: Plan; cached?: boolean }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "text"; text: string }
  | { type: "step_complete"; html?: string }
  | {
      type: "polish_mode";
      intent: PolishIntent;
      reason: string;
      targetSection?: string;
    }
  | { type: "css_patch_applied"; ruleCount: number; css: string; scoped: boolean }
  | { type: "error"; message: string };

export type OrchestratorOptions = {
  providerOverride?: { modelName?: string };
  skipPlanCache?: boolean;
  polishIntent?: PolishIntent;
  /** Принудительно указать секцию для scope (обход классификатора) */
  targetSection?: string;
};

function stripCodeFences(text: string): string {
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

  return enrichSectionAnchors(repairTruncatedHtml(cleaned));
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
      metrics.planCacheHit();
      return { plan: cached, cached: true };
    }
    metrics.planCacheMiss();
  }

  let candidateIds: string[] | undefined;
  try {
    const retrieved = await retrieveTemplates(sanitizedMessage, 5, signal);
    candidateIds = retrieved ?? undefined;
    if (candidateIds) {
      logger.info(SCOPE, `Retriever shortlist: ${candidateIds.join(", ")}`);
    }
  } catch (retrieverErr) {
    if ((retrieverErr as Error).name === "AbortError") throw retrieverErr;
  }

  try {
    const { object } = await generateObject({
      model,
      schema: PlanSchema,
      system: buildPlannerSystemPrompt(candidateIds),
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
      system: buildPlannerPrompt(candidateIds),
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

  const classification = classifyPolishIntent(sanitizedRequest);
  const intent = options.polishIntent ?? classification.intent;
  const targetSection = options.targetSection ?? classification.targetSection;
  const reason = options.polishIntent
    ? "user override"
    : classification.reason;

  metrics.polishIntent(intent, Boolean(targetSection));
  if (targetSection) metrics.polishSectionTarget(targetSection);

  yield { type: "polish_mode", intent, reason, targetSection };

  if (intent === "css_patch") {
    metrics.generationStarted("polish", provider.id);
    yield {
      type: "step_start",
      roleName: targetSection ? `CSS-Патчер (${targetSection})` : "CSS-Патчер",
      model: provider.defaultModel,
      provider: provider.id,
    };

    try {
      const result = await applyCssPatch({
        model,
        userRequest: sanitizedRequest,
        currentHtml: memory.currentHtml,
        targetSection,
        signal,
      });

      metrics.patchRulesGenerated(result.ruleCount);

      const finalHtml = enrichSectionAnchors(result.html);
      memory.currentHtml = finalHtml;
      memory.updatedAt = Date.now();
      updateSessionHtml(memory.sessionId, finalHtml);
      metrics.generationCompleted("polish", provider.id, Date.now() - startMs);

      yield {
        type: "css_patch_applied",
        ruleCount: result.ruleCount,
        css: result.css,
        scoped: result.scoped,
      };
      yield { type: "step_complete", html: finalHtml };
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const reasonCode =
        (err as Error).name === "ZodError" ? "schema" : "generation";
      metrics.cssPatchFallback(reasonCode);
      logger.warn(
        SCOPE,
        `CSS patch failed (${(err as Error).message}), falling back to full rewrite`,
      );
    }
  }

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
