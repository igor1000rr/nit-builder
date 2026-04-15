/**
 * Polish-режим пайплайна. Каскад трёх стратегий по убыванию стоимости:
 *
 *   1. CSS patch (intent="css_patch") — генерируем 200-500 prompt токенов
 *      нового CSS, прикладываем к currentHtml без рерайта. Самый дешёвый
 *      путь, работает для "сделай героя синим", "увеличь шрифт".
 *
 *   2. Section-only rewrite (Tier 3.5, intent="full_rewrite" + targetSection):
 *      вырезаем нужную <section>, шлём только её + запрос (~400 prompt),
 *      получаем новую секцию, склеиваем обратно в HTML.
 *
 *   3. Full rewrite (intent="full_rewrite" без section ИЛИ fallback):
 *      классический POLISHER_SYSTEM_PROMPT + весь currentHtml + запрос
 *      (~1500-3000 prompt), модель возвращает полный HTML.
 *
 * Каскад с graceful fallback: если CSS patch упал → пробуем section-only;
 * если section не найдена или ответ кривой → fallback на full rewrite.
 */

import { streamText } from "ai";
import {
  getPreferredProvider,
  getModel,
  calcMaxOutput,
} from "~/lib/llm/client";
import { sanitizeUserMessage } from "~/lib/utils/promptSanitizer";
import {
  updateSessionHtml,
  clearTruncation,
  setTruncation,
  type SessionMemory,
} from "~/lib/services/sessionMemory";
import { logger } from "~/lib/utils/logger";
import { metrics } from "~/lib/services/metrics";
import { enrichSectionAnchors } from "~/lib/utils/sectionAnchors";
import { applyCssPatch } from "~/lib/services/cssPatch";
import { classifyPolishIntent } from "~/lib/services/intentClassifier";
import {
  isSectionPolishEnabled,
  extractSection,
  extractSectionFromResponse,
  polishSectionStream,
} from "~/lib/services/sectionPolish";
import { recordGeneration } from "~/lib/services/feedbackStore";
import {
  MAX_CONTINUATION_ATTEMPTS,
  cleanRawForTail,
} from "~/lib/services/continuation";
import {
  POLISHER_SYSTEM_PROMPT,
  buildPolisherUserMessage,
} from "~/lib/config/htmlPrompts";
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
        polishScope: "css",
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

  // === Tier 3.5: section-only polish ===
  if (intent === "full_rewrite" && targetSection && isSectionPolishEnabled()) {
    const extracted = extractSection(memory.currentHtml, targetSection);
    if (extracted.found) {
      metrics.sectionPolishAttempted();
      const fullHtmlChars = memory.currentHtml.length;
      const sectionChars = extracted.sectionHtml.length;
      logger.info(
        SCOPE,
        `Section-polish path: section="${targetSection}" (${sectionChars}ch) of full HTML (${fullHtmlChars}ch), savings=${Math.round((1 - sectionChars / fullHtmlChars) * 100)}%`,
      );

      metrics.generationStarted("polish", provider.id);
      yield {
        type: "step_start",
        roleName: `Полировщик (секция "${targetSection}")`,
        model: provider.defaultModel,
        provider: provider.id,
      };

      try {
        const sectionTokensEstimate = Math.ceil(sectionChars / 3);
        const maxOutput = Math.min(
          Math.max(sectionTokensEstimate * 3, 1500),
          6000,
        );

        let rawText = "";
        let polishUsage = { prompt: 0, completion: 0 };
        let polishFinishReason = "unknown";

        const polishGen = polishSectionStream({
          model,
          sectionHtml: extracted.sectionHtml,
          sectionId: targetSection,
          userRequest: sanitizedRequest,
          signal,
          maxOutputTokens: maxOutput,
        });

        for await (const ev of polishGen) {
          if (ev.type === "delta") {
            rawText += ev.text;
            yield { type: "text", text: ev.text };
          } else if (ev.type === "done") {
            polishUsage = ev.result.usage;
            polishFinishReason = ev.result.finishReason;
          }
        }

        if (polishUsage.prompt > 0 || polishUsage.completion > 0) {
          metrics.tokensUsed("polish", "prompt", polishUsage.prompt);
          metrics.tokensUsed("polish", "completion", polishUsage.completion);
          yield {
            type: "tokens",
            mode: "polish",
            prompt: polishUsage.prompt,
            completion: polishUsage.completion,
          };
        }

        if (polishFinishReason === "length") {
          metrics.sectionPolishSkipped("truncated_response");
          logger.warn(
            SCOPE,
            `Section-polish ответ оборван (${rawText.length}ch), fallback на full rewrite`,
          );
        } else {
          const newSection = extractSectionFromResponse(rawText);
          if (!newSection) {
            metrics.sectionPolishSkipped("no_section_in_response");
            logger.warn(
              SCOPE,
              `Section-polish: ответ модели не содержит <section>, fallback на full rewrite`,
            );
          } else {
            const newFullHtml =
              extracted.before + newSection + extracted.after;
            const finalHtml = enrichSectionAnchors(newFullHtml);
            memory.currentHtml = finalHtml;
            memory.updatedAt = Date.now();
            updateSessionHtml(memory.sessionId, finalHtml);
            const totalMs = Date.now() - startMs;
            metrics.sectionPolishSucceeded(targetSection);
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
              polishScope: "section",
            });
            yield {
              type: "section_polish_used",
              sectionId: targetSection,
              sectionChars,
              fullHtmlChars,
            };
            yield { type: "step_complete", html: finalHtml };
            return;
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        metrics.sectionPolishSkipped("error");
        logger.warn(
          SCOPE,
          `Section-polish failed (${(err as Error).message}), fallback на full rewrite`,
        );
      }
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
        polishScope: "full",
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
      polishScope: "full",
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
      polishScope: "full",
      errorReason: `polisher: ${(err as Error).message}`,
    });
    yield { type: "error", message: `Ошибка полировщика: ${(err as Error).message}` };
  }
  void reason;
}
