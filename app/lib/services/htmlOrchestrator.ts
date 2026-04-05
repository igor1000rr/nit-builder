import { streamText, generateText } from "ai";
import { PlanSchema, extractPlanJson, type Plan } from "~/lib/utils/planSchema";
import {
  buildPlannerPrompt,
  buildCoderPrompt,
  buildPolisherPrompt,
} from "~/lib/config/htmlPrompts";
import {
  getTemplateById,
  getFallbackTemplate,
} from "~/lib/config/htmlTemplatesCatalog";
import { loadTemplateHtmlForLlm } from "~/lib/config/htmlTemplates.server";
import { getPreferredProvider, getModel, calcMaxOutput, checkContextBudget } from "~/lib/llm/client";
import { sanitizeUserMessage } from "~/lib/utils/promptSanitizer";
import { updateSessionHtml, type SessionMemory } from "~/lib/services/sessionMemory";
import { logger } from "~/lib/utils/logger";
import { metrics } from "~/lib/services/metrics";
import { repairTruncatedHtml } from "~/lib/utils/htmlRepair";

const SCOPE = "htmlOrchestrator";

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "plan_ready"; plan: Plan }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "text"; text: string }
  | { type: "step_complete"; html?: string }
  | { type: "error"; message: string };

export type OrchestratorOptions = {
  userApiKeys?: Record<string, string>;
  providerOverride?: { providerId?: string; modelName?: string };
};

function stripCodeFences(text: string): string {
  // Стратегия 1: если нашли <!DOCTYPE html> и </html> — берём всё между ними.
  // Это работает даже если LLM добавила префикс "Вот HTML:" или постфикс.
  const doctypeMatch = text.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  let extracted = doctypeMatch?.[0];

  if (!extracted) {
    // Стратегия 2: если DOCTYPE нет, но есть <html>...</html> — берём это.
    const htmlMatch = text.match(/<html[\s\S]*?<\/html>/i);
    extracted = htmlMatch?.[0];
  }

  if (!extracted) {
    // Стратегия 3 (fallback): срезаем markdown fences по старинке.
    extracted = text
      .replace(/^```html\s*/im, "")
      .replace(/^```\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
  }

  // Safety net: удаляем LLM-facing маркеры секций, если модель их скопировала.
  const cleaned = extracted
    .replace(/\s*<!--\s*═══\s*SECTION:[^>]*-->\s*/g, "\n")
    .replace(/\s*<!--\s*═══\s*END\s+SECTION\s*═══\s*-->\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Auto-repair: если LLM обрезал вывод (max_tokens), закрываем незакрытые теги
  return repairTruncatedHtml(cleaned);
}

export async function* executeHtmlSimple(
  memory: SessionMemory,
  userMessage: string,
  signal: AbortSignal,
  options: OrchestratorOptions = {},
): AsyncGenerator<PipelineEvent> {
  const provider = getPreferredProvider(options.userApiKeys, options.providerOverride);
  if (!provider) {
    yield {
      type: "error",
      message: "Нет доступного LLM провайдера. Запусти LM Studio или задай GROQ_API_KEY.",
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
  try {
    const { text: planRaw } = await generateText({
      model,
      system: buildPlannerPrompt(),
      prompt: sanitized,
      maxTokens: 1500,
      temperature: 0.3,
      abortSignal: signal,
    });

    // Двухуровневый fallback: JSON extraction + schema validation.
    // Обе ошибки ведут в fallback-план, а не падают — модель может выдать что угодно.
    let rawJson: unknown = null;
    try {
      rawJson = extractPlanJson(planRaw);
    } catch (parseErr) {
      logger.warn(SCOPE, `Plan JSON extract failed: ${(parseErr as Error).message}`);
    }

    const parsed = rawJson !== null ? PlanSchema.safeParse(rawJson) : null;
    if (!parsed || !parsed.success) {
      if (parsed) logger.warn(SCOPE, "Plan schema validation failed, using fallback");
      plan = {
        business_type: sanitized.slice(0, 100),
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
    } else {
      plan = parsed.data;
    }

    memory.planJson = plan;
    yield { type: "plan_ready", plan };
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
    const estimatedInput = templateHtml.length + JSON.stringify(plan).length + 2000;
    const budget = checkContextBudget(provider, estimatedInput, 8000);
    if (budget.warning) {
      logger.warn(SCOPE, budget.warning);
    }
    if (!budget.ok) {
      metrics.generationFailed("create", "context_overflow");
      yield { type: "error", message: budget.warning ?? "Context overflow" };
      return;
    }
    const maxOutput = calcMaxOutput(provider, estimatedInput);

    const result = await streamText({
      model,
      system: buildCoderPrompt({ templateHtml, plan }),
      prompt: "Адаптируй шаблон под план. Верни готовый HTML.",
      maxTokens: maxOutput,
      temperature: 0.4,
      abortSignal: signal,
    });

    let fullHtml = "";
    for await (const delta of result.textStream) {
      fullHtml += delta;
      yield { type: "text", text: delta };
    }

    fullHtml = stripCodeFences(fullHtml);
    // Update both local reference (for tests) and global session cache (for production)
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

  const provider = getPreferredProvider(options.userApiKeys, options.providerOverride);
  if (!provider) {
    yield { type: "error", message: "Нет доступного LLM провайдера." };
    return;
  }

  const model = getModel(provider);
  const startMs = Date.now();
  metrics.generationStarted("polish", provider.id);

  yield {
    type: "step_start",
    roleName: "Полировщик",
    model: provider.defaultModel,
    provider: provider.id,
  };

  try {
    const estimatedInput = memory.currentHtml.length + userRequest.length + 1000;
    const maxOutput = calcMaxOutput(provider, estimatedInput);

    const result = await streamText({
      model,
      system: buildPolisherPrompt({
        currentHtml: memory.currentHtml,
        userRequest: sanitizeUserMessage(userRequest),
      }),
      prompt: userRequest,
      maxTokens: maxOutput,
      temperature: 0.3,
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
