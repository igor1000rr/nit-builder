/**
 * Public API barrel — backward compat для существующих импортов.
 *
 * Реальная реализация разделена на модули по ответственности (раньше всё это
 * было одним файлом 38KB):
 *
 *   - htmlOrchestrator.types     — PipelineEvent, OrchestratorOptions
 *   - htmlOrchestrator.helpers   — stripCodeFences, readUsage, readFinishReason, HTML_STOP_SEQUENCES, SCOPE
 *   - pipelinePlanner            — obtainPlan, runPlannerForEval (Planner pipeline)
 *   - pipelineCreate             — executeHtmlSimple (create-режим)
 *   - pipelineContinue           — executeHtmlContinue (дозаправка)
 *   - pipelinePolish             — executeHtmlPolish (polish caskad: css_patch → section → full)
 *
 * Все существующие импорты из `~/lib/services/htmlOrchestrator` продолжают работать.
 */

export type {
  PipelineEvent,
  OrchestratorOptions,
} from "~/lib/services/htmlOrchestrator.types";

export { executeHtmlSimple } from "~/lib/services/pipelineCreate";
export { executeHtmlContinue } from "~/lib/services/pipelineContinue";
export { executeHtmlPolish } from "~/lib/services/pipelinePolish";
export { runPlannerForEval } from "~/lib/services/pipelinePlanner";
