/**
 * Planner pipeline: получение Plan из user-сообщения через каскад стратегий.
 *
 * Порядок:
 *   1. planCache lookup (нормализованный query) — мгновенный hit для повторов
 *   2. Template retriever — embedding-shortlist кандидатов из каталога
 *   3. Few-shot RAG — buildFewShotPlansAdaptive с adaptive k
 *   4. Reasoning preamble — generatePlanReasoning если включён (NIT_REASONING_ENABLED)
 *   5. Constrained decoding — generatePlanConstrained если поддерживается провайдером
 *   6. generateObject(PlanSchema) — основной structured output путь
 *   7. generateText + extractPlanJson + safeParse — fallback на сырой JSON
 *   8. Synthetic fallback — если всё упало, минимальный валидный plan
 *
 * Plan кешируется при успехе (кроме synthetic). Cache hit фиксируется в metrics.
 */

import { generateObject, generateText } from "ai";
import { PlanSchema, extractPlanJson, type Plan } from "~/lib/utils/planSchema";
import {
  buildPlannerSystemPrompt,
  buildPlannerPrompt,
} from "~/lib/config/htmlPrompts";
import { getModel } from "~/lib/llm/client";
import { logger } from "~/lib/utils/logger";
import { metrics } from "~/lib/services/metrics";
import { getCachedPlan, setCachedPlan } from "~/lib/services/planCache";
import { retrieveTemplates } from "~/lib/services/templateRetriever";
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
import { normalizePlanForRequest } from "~/lib/services/planQuality";
import { SCOPE } from "~/lib/services/htmlOrchestrator.helpers";

export type ObtainedPlan = {
  plan: Plan;
  cached: boolean;
  fewShotCount: number;
  fewShotTopScore: number;
  fewShotApproxTokens: number;
  reasoningChars: number;
};

export async function obtainPlan(
  model: ReturnType<typeof getModel>,
  sanitizedMessage: string,
  signal: AbortSignal,
  skipCache: boolean,
  modelName: string,
): Promise<ObtainedPlan> {
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
      const plan = normalizePlanForRequest(constrained.plan, sanitizedMessage);
      setCachedPlan(sanitizedMessage, plan);
      logger.info(SCOPE, "Plan generated via constrained decoding");
      return {
        plan,
        cached: false,
        fewShotCount,
        fewShotTopScore,
        fewShotApproxTokens,
        reasoningChars,
      };
    }
    logger.warn(
      SCOPE,
      `Constrained decoding failed (${constrained.reason}), fallback to generateObject`,
    );
  }

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
    const plan = normalizePlanForRequest(object, sanitizedMessage);
    setCachedPlan(sanitizedMessage, plan);
    return {
      plan,
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
      const plan = normalizePlanForRequest(parsed.data, sanitizedMessage);
      setCachedPlan(sanitizedMessage, plan);
      return {
        plan,
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
  const plan = normalizePlanForRequest(synthetic, sanitizedMessage);
  return {
    plan,
    cached: false,
    fewShotCount,
    fewShotTopScore,
    fewShotApproxTokens,
    reasoningChars,
  };
}

/**
 * Wrapper для eval-режима — обходит planCache и возвращает структуру удобную
 * для eval/metrics (plan|null + fewShotCount + usedReasoning + опц. error).
 * Не бросает, ловит ошибки кроме AbortError.
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
      true,
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
