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
import {
  updateSessionHtml,
  setTruncation,
  clearTruncation,
  type SessionMemory,
} from "~/lib/services/sessionMemory";
import { logger } from "~/lib/utils/logger";
import { metrics } from "~/lib/services/metrics";
import { repairTruncatedHtml } from "~/lib/utils/htmlRepair";
import { getCachedPlan, setCachedPlan } from "~/lib/services/planCache";
import { classifyPolishIntent, type PolishIntent } from "~/lib/services/intentClassifier";
import { applyCssPatch } from "~/lib/services/cssPatch";
import { retrieveTemplates } from "~/lib/services/templateRetriever";
import { enrichSectionAnchors } from "~/lib/utils/sectionAnchors";
import { recordGeneration } from "~/lib/services/feedbackStore";
import { pruneTemplateForPlan } from "~/lib/utils/templatePrune";
import {
  CONTINUATION_SYSTEM_PROMPT,
  CONTINUATION_TAIL_CHARS,
  MAX_CONTINUATION_ATTEMPTS,
  buildContinuationUserMessage,
  joinPartialAndContinuation,
  cleanRawForTail,
  extractTail,
} from "~/lib/services/continuation";
import { buildFewShotPlansAdaptive } from "~/lib/services/fewShotBuilder";
import {
  generatePlanReasoning,
  buildAugmentedPlannerPrompt,
  isReasoningEnabled,
} from "~/lib/services/planReasoning";
import {
  generatePlanConstrained,
  isConstrainedDecodingEnabled,
} from "~/lib/services/constrainedPlanGen";

const SCOPE = "htmlOrchestrator";

const HTML_STOP_SEQUENCES = ["</html>", "```\n\n", "\n```"];

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "plan_ready"; plan: Plan; cached?: boolean }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "template_pruned"; removed: string[]; kept: string[] }
  | { type: "text"; text: string }
  | { type: "step_complete"; html?: string }
  | {
      type: "polish_mode";
      intent: PolishIntent;
      reason: string;
      targetSection?: string;
    }
  | { type: "css_patch_applied"; ruleCount: number; css: string; scoped: boolean }
  | {
      type: "truncated";
      canContinue: boolean;
      attemptsLeft: number;
      partialChars: number;
    }
  | {
      type: "tokens";
      mode: "create" | "polish" | "continue";
      prompt: number;
      completion: number;
    }
  | { type: "rag_fewshot"; count: number; topScore: number; approxTokens: number }
  | { type: "plan_reasoning"; chars: number }
  | { type: "error"; message: string };

export type OrchestratorOptions = {
  providerOverride?: { modelName?: string };
  skipPlanCache?: boolean;
  polishIntent?: PolishIntent;
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

/**
 * Ядро Planner pipeline. Tier 2 порядок fallback-ов:
 *   1. plan cache check
 *   2. template retriever (shortlist)
 *   3. RAG few-shot (hybrid: cosine + BM25 + RRF + reranker, contextual prefix)
 *   4. двухшаговый reasoning (опционально через ENV)
 *   5. constrained decoding через LM Studio json_schema (XGrammar) — 100% валидный JSON
 *   6. fallback: AI SDK generateObject (prompt-engineering JSON mode)
 *   7. fallback: generateText + manual JSON parse
 *   8. synthetic plan как last resort
 */
async function obtainPlan(
  model: ReturnType<typeof getModel>,
  sanitizedMessage: string,
  signal: AbortSignal,
  skipCache: boolean,
  modelName: string,
): Promise<{
  plan: Plan;
  cached: boolean;
  fewShotCount: number;
  fewShotTopScore: number;
  fewShotApproxTokens: number;
  reasoningChars: number;
}> {
  if (!skipCache) {
    const cached = getCachedPlan(sanitizedMessage);
    if (cached) {
      logger.info(SCOPE, `Plan cache hit for: ${sanitizedMessage.slice(0, 60)}`);
      metrics.planCacheHit();
      return {
        plan: cached,
        cached: true,
        fewShotCount: 0,
        fewShotTopScore: 0,
        fewShotApproxTokens: 0,
        reasoningChars: 0,
      };
    }
    metrics.planCacheMiss();
  }

  // Template retriever shortlist
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

  // RAG few-shot (hybrid pipeline)
  let fewShotBlock = "";
  let fewShotCount = 0;
  let fewShotTopScore = 0;
  let fewShotApproxTokens = 0;
  try {
    const fs = await buildFewShotPlansAdaptive(sanitizedMessage, signal);
    fewShotBlock = fs.block;
    fewShotCount = fs.count;
    fewShotTopScore = fs.topScore;
    fewShotApproxTokens = fs.approxTokens;
  } catch (ragErr) {
    if ((ragErr as Error).name === "AbortError") throw ragErr;
  }

  // Two-step reasoning (первый шаг: свободный анализ)
  let reasoning = "";
  if (isReasoningEnabled()) {
    try {
      reasoning = await generatePlanReasoning(model, sanitizedMessage, signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }
  const reasoningChars = reasoning.length;
  const augmentedPrompt = buildAugmentedPlannerPrompt(sanitizedMessage, reasoning);
  const systemPrompt = buildPlannerSystemPrompt(candidateIds, fewShotBlock);

  // Step с5: Constrained decoding (LM Studio json_schema — XGrammar gives 100% valid JSON)
  if (isConstrainedDecodingEnabled()) {
    const constrained = await generatePlanConstrained({
      modelName,
      systemPrompt,
      userPrompt: augmentedPrompt,
      maxOutputTokens: 2500,
      temperature: 0.3,
      signal,
    });
    if (constrained.ok) {
      setCachedPlan(sanitizedMessage, constrained.plan);
      logger.info(SCOPE, "Plan generated via constrained decoding");
      return {
        plan: constrained.plan,
        cached: false,
        fewShotCount,
        fewShotTopScore,
        fewShotApproxTokens,
        reasoningChars,
      };
    }
    // Если transient — пробуем дальше generateObject. Если unsupported — тоже
    // пробуем (вдруг SDK справится), но в generatePlanConstrained уже
    // выставлен runtimeDisabled=true — дальше по сессии сразу generateObject.
    logger.warn(
      SCOPE,
      `Constrained decoding failed (${constrained.reason}), fallback to generateObject`,
    );
  }

  // Step 6: structured generateObject (AI SDK prompt-mode)
  try {
    const { object } = await generateObject({
      model,
      schema: PlanSchema,
      system: systemPrompt,
      prompt: augmentedPrompt,
      temperature: 0.3,
      abortSignal: signal,
      maxOutputTokens: 2500,
    });
    setCachedPlan(sanitizedMessage, object);
    return {
      plan: object,
      cached: false,
      fewShotCount,
      fewShotTopScore,
      fewShotApproxTokens,
      reasoningChars,
    };
  } catch (structErr) {
    if ((structErr as Error).name === "AbortError") throw structErr;
    logger.warn(
      SCOPE,
      `generateObject failed (${(structErr as Error).message}), fallback to generateText`,
    );
  }

  // Step 7: free-form generateText + manual JSON parse
  try {
    const { text: planRaw } = await generateText({
      model,
      system: buildPlannerPrompt(candidateIds, fewShotBlock),
      prompt: augmentedPrompt,
      maxOutputTokens: 2500,
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
      return {
        plan: parsed.data,
        cached: false,
        fewShotCount,
        fewShotTopScore,
        fewShotApproxTokens,
        reasoningChars,
      };
    }
    logger.warn(SCOPE, "Plan schema validation failed, using fallback plan");
  } catch (genErr) {
    if ((genErr as Error).name === "AbortError") throw genErr;
    logger.warn(SCOPE, `Fallback generateText failed: ${(genErr as Error).message}`);
  }

  // Step 8: synthetic last resort
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
  return {
    plan: synthetic,
    cached: false,
    fewShotCount,
    fewShotTopScore,
    fewShotApproxTokens,
    reasoningChars,
  };
}

/**
 * Public entry для eval-pipeline. Использует obtainPlan с skipCache=true,
 * не пишет feedback и не трогает sessionMemory.
 */
export async function runPlannerForEval(params: {
  model: ReturnType<typeof getModel>;
  modelName: string;
  sanitizedMessage: string;
  signal: AbortSignal;
}): Promise<{
  plan: Plan | null;
  fewShotCount: number;
  usedReasoning: boolean;
  error?: string;
}> {
  try {
    const result = await obtainPlan(
      params.model,
      params.sanitizedMessage,
      params.signal,
      true, // всегда skipCache в eval
      params.modelName,
    );
    return {
      plan: result.plan,
      fewShotCount: result.fewShotCount,
      usedReasoning: result.reasoningChars > 0,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return {
      plan: null,
      fewShotCount: 0,
      usedReasoning: false,
      error: (err as Error).message,
    };
  }
}

async function readUsage(
  result: { usage: Promise<unknown> | unknown },
): Promise<{ prompt: number; completion: number }> {
  try {
    const raw = (await result.usage) as
      | {
          promptTokens?: number;
          inputTokens?: number;
          completionTokens?: number;
          outputTokens?: number;
        }
      | undefined;
    if (!raw) return { prompt: 0, completion: 0 };
    return {
      prompt: raw.promptTokens ?? raw.inputTokens ?? 0,
      completion: raw.completionTokens ?? raw.outputTokens ?? 0,
    };
  } catch {
    return { prompt: 0, completion: 0 };
  }
}

async function readFinishReason(
  result: { finishReason: Promise<unknown> | unknown },
): Promise<string> {
  try {
    return String((await result.finishReason) ?? "unknown");
  } catch {
    return "unknown";
  }
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

  clearTruncation(memory.sessionId);

  let currentPlan: Plan | undefined;
  let currentTemplateId: string | undefined;
  let planCachedFlag = false;

  yield {
    type: "step_start",
    roleName: "Планировщик",
    model: provider.defaultModel,
    provider: provider.id,
  };

  try {
    const obtained = await obtainPlan(
      model,
      sanitized,
      signal,
      options.skipPlanCache ?? false,
      provider.defaultModel,
    );
    currentPlan = obtained.plan;
    planCachedFlag = obtained.cached;
    memory.planJson = obtained.plan;
    if (obtained.reasoningChars > 0) {
      yield { type: "plan_reasoning", chars: obtained.reasoningChars };
    }
    if (obtained.fewShotCount > 0) {
      yield {
        type: "rag_fewshot",
        count: obtained.fewShotCount,
        topScore: obtained.fewShotTopScore,
        approxTokens: obtained.fewShotApproxTokens,
      };
    }
    yield { type: "plan_ready", plan: obtained.plan, cached: obtained.cached };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("create", "planner_error");
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "create",
      outcome: "error",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: Date.now() - startMs,
      userMessage: sanitized,
      errorReason: `planner: ${(err as Error).message}`,
    });
    yield { type: "error", message: `Ошибка планировщика: ${(err as Error).message}` };
    return;
  }

  const template = getTemplateById(currentPlan.suggested_template_id) ?? getFallbackTemplate();
  const rawTemplateHtml = loadTemplateHtmlForLlm(template.id);
  memory.templateId = template.id;
  currentTemplateId = template.id;

  yield { type: "template_selected", templateId: template.id, templateName: template.name };
  metrics.templateSelected(template.id);

  const pruneResult = pruneTemplateForPlan(rawTemplateHtml, currentPlan.sections);
  const templateHtml = pruneResult.html;
  if (pruneResult.removed.length > 0) {
    logger.info(
      SCOPE,
      `Pruned ${pruneResult.removed.length} sections from ${template.id}: removed=[${pruneResult.removed.join(", ")}], kept=[${pruneResult.kept.join(", ")}], saved=${rawTemplateHtml.length - templateHtml.length}ch`,
    );
    metrics.templatePruned(pruneResult.removed.length);
    yield {
      type: "template_pruned",
      removed: pruneResult.removed,
      kept: pruneResult.kept,
    };
  }

  yield {
    type: "step_start",
    roleName: "Кодер",
    model: provider.defaultModel,
    provider: provider.id,
  };

  try {
    const planJsonStr = JSON.stringify(currentPlan);
    const estimatedInputChars =
      templateHtml.length + planJsonStr.length + CODER_SYSTEM_PROMPT.length + 200;
    const budget = checkContextBudget(provider, estimatedInputChars, 8000);
    if (budget.warning) logger.warn(SCOPE, budget.warning);
    if (!budget.ok) {
      metrics.generationFailed("create", "context_overflow");
      recordGeneration({
        sessionId: memory.sessionId,
        mode: "create",
        outcome: "error",
        provider: provider.id,
        model: provider.defaultModel,
        durationMs: Date.now() - startMs,
        userMessage: sanitized,
        plan: currentPlan,
        templateId: currentTemplateId,
        planCached: planCachedFlag,
        errorReason: "context_overflow",
      });
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
      prompt: buildCoderUserMessage({ templateHtml, plan: currentPlan }),
      maxOutputTokens: maxOutput,
      temperature: 0.4,
      stopSequences: HTML_STOP_SEQUENCES,
      abortSignal: signal,
    });

    let rawHtml = "";
    for await (const delta of result.textStream) {
      rawHtml += delta;
      yield { type: "text", text: delta };
    }

    const finishReason = await readFinishReason(result);
    const usage = await readUsage(result);
    if (usage.prompt > 0 || usage.completion > 0) {
      metrics.tokensUsed("create", "prompt", usage.prompt);
      metrics.tokensUsed("create", "completion", usage.completion);
      yield {
        type: "tokens",
        mode: "create",
        prompt: usage.prompt,
        completion: usage.completion,
      };
    }

    const totalMs = Date.now() - startMs;

    if (finishReason === "length") {
      metrics.generationTruncated("create");
      const rawForTail = cleanRawForTail(rawHtml);
      setTruncation(memory.sessionId, {
        mode: "create",
        userMessage: sanitized,
        plan: currentPlan,
        templateId: currentTemplateId,
        partialHtml: rawForTail,
        attempt: 0,
        providerId: provider.id,
      });
      const preview = stripCodeFences(rawHtml);
      memory.currentHtml = preview;
      memory.updatedAt = Date.now();
      updateSessionHtml(memory.sessionId, preview);
      metrics.generationCompleted("create", provider.id, totalMs);
      recordGeneration({
        sessionId: memory.sessionId,
        mode: "create",
        outcome: "success",
        provider: provider.id,
        model: provider.defaultModel,
        durationMs: totalMs,
        userMessage: sanitized,
        plan: currentPlan,
        templateId: currentTemplateId,
        planCached: planCachedFlag,
        errorReason: "truncated",
      });
      yield {
        type: "truncated",
        canContinue: true,
        attemptsLeft: MAX_CONTINUATION_ATTEMPTS,
        partialChars: rawForTail.length,
      };
      yield { type: "step_complete", html: preview };
      return;
    }

    const fullHtml = stripCodeFences(rawHtml);
    memory.currentHtml = fullHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, fullHtml);
    metrics.generationCompleted("create", provider.id, totalMs);
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "create",
      outcome: "success",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: totalMs,
      userMessage: sanitized,
      plan: currentPlan,
      templateId: currentTemplateId,
      planCached: planCachedFlag,
    });
    yield { type: "step_complete", html: fullHtml };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("create", "coder_error");
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "create",
      outcome: "error",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: Date.now() - startMs,
      userMessage: sanitized,
      plan: currentPlan,
      templateId: currentTemplateId,
      planCached: planCachedFlag,
      errorReason: `coder: ${(err as Error).message}`,
    });
    yield { type: "error", message: `Ошибка кодера: ${(err as Error).message}` };
  }
}

export async function* executeHtmlContinue(
  memory: SessionMemory,
  signal: AbortSignal,
  options: OrchestratorOptions = {},
): AsyncGenerator<PipelineEvent> {
  const t = memory.truncation;
  if (!t) {
    yield {
      type: "error",
      message: "Нет оборванной генерации для продолжения. Сначала создай сайт.",
    };
    return;
  }
  if (t.attempt >= MAX_CONTINUATION_ATTEMPTS) {
    yield {
      type: "error",
      message: `Достигнут лимит продолжений (${MAX_CONTINUATION_ATTEMPTS}). HTML зафинализирован через repair. Создай новую сессию или продолжи через polish.`,
    };
    return;
  }

  const provider = getPreferredProvider(options.providerOverride);
  if (!provider) {
    yield { type: "error", message: "Нет доступного LLM провайдера." };
    return;
  }

  const model = getModel(provider);
  const startMs = Date.now();
  const nextAttempt = t.attempt + 1;
  metrics.generationStarted("continue", provider.id);

  yield {
    type: "step_start",
    roleName: `Продолжение (попытка ${nextAttempt}/${MAX_CONTINUATION_ATTEMPTS})`,
    model: provider.defaultModel,
    provider: provider.id,
  };

  const tail = extractTail(t.partialHtml, CONTINUATION_TAIL_CHARS);
  const userPrompt = buildContinuationUserMessage({
    userMessage: t.userMessage,
    plan: t.plan,
    tail,
  });

  try {
    const estimatedInputChars =
      CONTINUATION_SYSTEM_PROMPT.length + userPrompt.length + 200;
    const maxOutput = calcMaxOutput(provider, estimatedInputChars);

    const result = await streamText({
      model,
      system: CONTINUATION_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: maxOutput,
      temperature: 0.3,
      stopSequences: HTML_STOP_SEQUENCES,
      abortSignal: signal,
    });

    let continuation = "";
    for await (const delta of result.textStream) {
      continuation += delta;
      yield { type: "text", text: delta };
    }

    const finishReason = await readFinishReason(result);
    const usage = await readUsage(result);
    if (usage.prompt > 0 || usage.completion > 0) {
      metrics.tokensUsed("continue", "prompt", usage.prompt);
      metrics.tokensUsed("continue", "completion", usage.completion);
      yield {
        type: "tokens",
        mode: "continue",
        prompt: usage.prompt,
        completion: usage.completion,
      };
    }

    const cleanedContinuation = cleanRawForTail(continuation);
    const joined = joinPartialAndContinuation(t.partialHtml, cleanedContinuation);
    const totalMs = Date.now() - startMs;

    if (finishReason === "length") {
      metrics.generationTruncated("continue");
      setTruncation(memory.sessionId, {
        ...t,
        partialHtml: joined,
        attempt: nextAttempt,
      });
      const preview = stripCodeFences(joined);
      memory.currentHtml = preview;
      memory.updatedAt = Date.now();
      updateSessionHtml(memory.sessionId, preview);
      metrics.generationCompleted("continue", provider.id, totalMs);
      recordGeneration({
        sessionId: memory.sessionId,
        mode: "create",
        outcome: "success",
        provider: provider.id,
        model: provider.defaultModel,
        durationMs: totalMs,
        userMessage: t.userMessage,
        plan: t.plan,
        templateId: t.templateId,
        errorReason: `continue_${nextAttempt}_truncated`,
      });
      yield {
        type: "truncated",
        canContinue: nextAttempt < MAX_CONTINUATION_ATTEMPTS,
        attemptsLeft: MAX_CONTINUATION_ATTEMPTS - nextAttempt,
        partialChars: joined.length,
      };
      yield { type: "step_complete", html: preview };
      return;
    }

    const finalHtml = stripCodeFences(joined);
    memory.currentHtml = finalHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, finalHtml);
    clearTruncation(memory.sessionId);
    metrics.generationCompleted("continue", provider.id, totalMs);
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "create",
      outcome: "success",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: totalMs,
      userMessage: t.userMessage,
      plan: t.plan,
      templateId: t.templateId,
      errorReason: `continue_${nextAttempt}_ok`,
    });
    yield { type: "step_complete", html: finalHtml };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("continue", "continue_error");
    yield {
      type: "error",
      message: `Ошибка продолжения: ${(err as Error).message}`,
    };
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

  clearTruncation(memory.sessionId);

  const model = getModel(provider);
  const startMs = Date.now();
  const sanitizedRequest = sanitizeUserMessage(userRequest);

  const classification = classifyPolishIntent(sanitizedRequest);
  const intent = options.polishIntent ?? classification.intent;
  const targetSection = options.targetSection ?? classification.targetSection;
  const reason = options.polishIntent ? "user override" : classification.reason;

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
      const totalMs = Date.now() - startMs;
      metrics.generationCompleted("polish", provider.id, totalMs);
      recordGeneration({
        sessionId: memory.sessionId,
        mode: "polish",
        outcome: "success",
        provider: provider.id,
        model: provider.defaultModel,
        durationMs: totalMs,
        userMessage: sanitizedRequest,
        templateId: memory.templateId,
        polishIntent: "css_patch",
        polishTargetSection: targetSection,
        cssPatchRuleCount: result.ruleCount,
      });

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
      const reasonCode = (err as Error).name === "ZodError" ? "schema" : "generation";
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

    let rawHtml = "";
    for await (const delta of result.textStream) {
      rawHtml += delta;
      yield { type: "text", text: delta };
    }

    const finishReason = await readFinishReason(result);
    const usage = await readUsage(result);
    if (usage.prompt > 0 || usage.completion > 0) {
      metrics.tokensUsed("polish", "prompt", usage.prompt);
      metrics.tokensUsed("polish", "completion", usage.completion);
      yield {
        type: "tokens",
        mode: "polish",
        prompt: usage.prompt,
        completion: usage.completion,
      };
    }

    const totalMs = Date.now() - startMs;

    if (finishReason === "length") {
      metrics.generationTruncated("polish");
      const rawForTail = cleanRawForTail(rawHtml);
      setTruncation(memory.sessionId, {
        mode: "polish",
        userMessage: sanitizedRequest,
        templateId: memory.templateId,
        partialHtml: rawForTail,
        attempt: 0,
        providerId: provider.id,
      });
      const preview = stripCodeFences(rawHtml);
      memory.currentHtml = preview;
      memory.updatedAt = Date.now();
      updateSessionHtml(memory.sessionId, preview);
      metrics.generationCompleted("polish", provider.id, totalMs);
      recordGeneration({
        sessionId: memory.sessionId,
        mode: "polish",
        outcome: "success",
        provider: provider.id,
        model: provider.defaultModel,
        durationMs: totalMs,
        userMessage: sanitizedRequest,
        templateId: memory.templateId,
        polishIntent: "full_rewrite",
        polishTargetSection: targetSection,
        errorReason: "truncated",
      });
      yield {
        type: "truncated",
        canContinue: true,
        attemptsLeft: MAX_CONTINUATION_ATTEMPTS,
        partialChars: rawForTail.length,
      };
      yield { type: "step_complete", html: preview };
      return;
    }

    const fullHtml = stripCodeFences(rawHtml);
    memory.currentHtml = fullHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, fullHtml);
    metrics.generationCompleted("polish", provider.id, totalMs);
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "polish",
      outcome: "success",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: totalMs,
      userMessage: sanitizedRequest,
      templateId: memory.templateId,
      polishIntent: "full_rewrite",
      polishTargetSection: targetSection,
    });
    yield { type: "step_complete", html: fullHtml };
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    metrics.generationFailed("polish", "polisher_error");
    recordGeneration({
      sessionId: memory.sessionId,
      mode: "polish",
      outcome: "error",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: Date.now() - startMs,
      userMessage: sanitizedRequest,
      templateId: memory.templateId,
      polishIntent: intent,
      polishTargetSection: targetSection,
      errorReason: `polisher: ${(err as Error).message}`,
    });
    yield { type: "error", message: `Ошибка полировщика: ${(err as Error).message}` };
  }
  void reason;
}
