/**
 * Continuation pipeline: дозаправляет оборванный HTML.
 *
 * После create/polish с finishReason="length" сессия запоминает partialHtml.
 * /api/pipeline/simple mode=continue вызывает этот генератор: модель
 * получает CONTINUATION_SYSTEM_PROMPT + tail партиала + plan, и продолжает
 * генерацию ровно с того места.
 *
 * Лимит MAX_CONTINUATION_ATTEMPTS защищает от бесконечного цикла; после него
 * partialHtml финализируется через repairTruncatedHtml внутри stripCodeFences.
 */

import { streamText } from "ai";
import {
  getPreferredProvider,
  getModel,
  calcMaxOutput,
} from "~/lib/llm/client";
import {
  updateSessionHtml,
  setTruncation,
  clearTruncation,
  type SessionMemory,
} from "~/lib/services/sessionMemory";
import { metrics } from "~/lib/services/metrics";
import { recordGeneration } from "~/lib/services/feedbackStore";
import {
  CONTINUATION_SYSTEM_PROMPT,
  CONTINUATION_TAIL_CHARS,
  MAX_CONTINUATION_ATTEMPTS,
  buildContinuationUserMessage,
  joinPartialAndContinuation,
  cleanRawForTail,
  extractTail,
} from "~/lib/services/continuation";
import {
  stripCodeFences,
  readUsage,
  readFinishReason,
  HTML_STOP_SEQUENCES,
} from "~/lib/services/htmlOrchestrator.helpers";
import type {
  PipelineEvent,
  OrchestratorOptions,
} from "~/lib/services/htmlOrchestrator.types";

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
