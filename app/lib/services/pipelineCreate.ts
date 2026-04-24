/**
 * Create-режим пайплайна: Planner → Template → Skeleton-injection (Tier 3) → Coder.
 *
 * Skeleton-injection. Если plan содержит весь требуемый копирайт И в шаблоне
 * есть совместимая структура для слотов — Coder LLM пропускается, экономит
 * ~6000+ prompt tokens и ~10s latency. Иначе — стандартный Coder pipeline.
 *
 * Tier 4 — extended slots в skeleton: pricing_tiers / faq / hours_text / contact_*.
 * Заполняются только если plan содержит данные И section найдена в шаблоне.
 */

import { streamText } from "ai";
import type { Plan } from "~/lib/utils/planSchema";
import {
  CODER_SYSTEM_PROMPT,
  buildCoderUserMessage,
} from "~/lib/config/htmlPrompts";
import {
  getTemplateById,
  getFallbackTemplate,
} from "~/lib/config/htmlTemplatesCatalog";
import {
  loadTemplateHtml,
  loadTemplateHtmlForLlm,
} from "~/lib/config/htmlTemplates.server";
import {
  getPreferredProvider,
  getModel,
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
import { recordGeneration } from "~/lib/services/feedbackStore";
import { pruneTemplateForPlan } from "~/lib/utils/templatePrune";
import { MAX_CONTINUATION_ATTEMPTS, cleanRawForTail } from "~/lib/services/continuation";
import { injectPlanIntoTemplate } from "~/lib/services/skeletonInjector";
import { injectStylePreset, type StylePresetId } from "~/lib/llm/style-presets";
import { obtainPlan } from "~/lib/services/pipelinePlanner";
import {
  stripCodeFences,
  readUsage,
  readFinishReason,
  HTML_STOP_SEQUENCES,
  SCOPE,
} from "~/lib/services/htmlOrchestrator.helpers";
import type {
  PipelineEvent,
  OrchestratorOptions,
} from "~/lib/services/htmlOrchestrator.types";

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
  memory.templateId = template.id;
  // Раньше дублировался в local `let currentTemplateId` — после селекта
  // template остаётся в том же скоупе и не пере-присваивается, дублёр
  // удалён. Везде ниже используется напрямую template.id.

  yield { type: "template_selected", templateId: template.id, templateName: template.name };
  metrics.templateSelected(template.id);

  metrics.skeletonInjectAttempted();
  const cleanTemplateHtml = loadTemplateHtml(template.id);
  const injection = injectPlanIntoTemplate(cleanTemplateHtml, currentPlan);

  if (injection.ok) {
    metrics.skeletonInjectSucceeded(template.id, injection.fillRatio);
    metrics.skeletonExtendedSlotsFilled(injection.extendedSlotsFilled);
    const finalHtml = stripCodeFences(injection.html);
    memory.currentHtml = finalHtml;
    memory.updatedAt = Date.now();
    updateSessionHtml(memory.sessionId, finalHtml);
    const totalMs = Date.now() - startMs;
    metrics.generationCompleted("create", provider.id, totalMs);

    logger.info(
      SCOPE,
      `Skeleton-injection сработала: ${template.id}, slots=${injection.slotsFilled}/${injection.slotsTotal}, ext=${injection.extendedSlotsFilled}, fillRatio=${injection.fillRatio.toFixed(2)}, totalMs=${totalMs} (Coder пропущен)`,
    );

    recordGeneration({
      sessionId: memory.sessionId,
      mode: "create",
      outcome: "success",
      provider: provider.id,
      model: provider.defaultModel,
      durationMs: totalMs,
      userMessage: sanitized,
      plan: currentPlan,
      templateId: template.id,
      planCached: planCachedFlag,
      injectMethod: "skeleton",
      skeletonFillRatio: injection.fillRatio,
    });

    yield {
      type: "skeleton_inject_used",
      templateId: template.id,
      slotsFilled: injection.slotsFilled,
      slotsTotal: injection.slotsTotal,
      fillRatio: injection.fillRatio,
      extendedSlotsFilled: injection.extendedSlotsFilled,
    };
    yield { type: "step_complete", html: finalHtml };
    return;
  }

  metrics.skeletonInjectSkipped(injection.reason);
  logger.info(SCOPE, `Skeleton-injection пропущена (${injection.reason}), вызываем Coder`);

  const rawTemplateHtml = loadTemplateHtmlForLlm(template.id);
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

  // === Style preset injection для Coder system prompt ===
  // Default "generic" → no-op (возвращает CODER_SYSTEM_PROMPT без изменений).
  // "neon-cyber" → дописывает ~900 chars правил (палитра, шрифты, glitch/hairline).
  // Сохраняем исходный prompt чтобы можно было считать promptDelta для дебага.
  const presetId: StylePresetId = options.stylePresetId ?? "generic";
  const coderSystemPrompt = injectStylePreset(CODER_SYSTEM_PROMPT, presetId);
  const promptDelta = coderSystemPrompt.length - CODER_SYSTEM_PROMPT.length;
  if (promptDelta > 0) {
    yield { type: "style_preset_used", presetId, promptDelta };
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
      templateHtml.length + planJsonStr.length + coderSystemPrompt.length + 200;
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
        templateId: template.id,
        planCached: planCachedFlag,
        injectMethod: "coder",
        errorReason: "context_overflow",
      });
      yield { type: "error", message: budget.warning ?? "Context overflow" };
      return;
    }

    const maxOutput = calcCoderMaxOutput(
      provider,
      templateHtml.length,
      planJsonStr.length,
      coderSystemPrompt.length,
    );

    const result = await streamText({
      model,
      system: coderSystemPrompt,
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
        templateId: template.id,
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
        templateId: template.id,
        planCached: planCachedFlag,
        injectMethod: "coder",
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
      templateId: template.id,
      planCached: planCachedFlag,
      injectMethod: "coder",
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
      templateId: template.id,
      planCached: planCachedFlag,
      injectMethod: "coder",
      errorReason: `coder: ${(err as Error).message}`,
    });
    yield { type: "error", message: `Ошибка кодера: ${(err as Error).message}` };
  }
}
