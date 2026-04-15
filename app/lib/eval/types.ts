/**
 * Типы для eval-pipeline.
 *
 * Главная цель — иметь воспроизводимый baseline качества Planner для
 * сравнения А/Б экспериментов (с RAG vs без, с reasoning vs без, новый seed
 * корпус vs старый, и т.д.).
 *
 * Метрики автоматические, без LLM-judge: проверяют синтаксис плана
 * (PlanSchema), длины полей, наличие конкретики (числа, факты), отсутствие
 * шаблонных фраз, попадание в нишу.
 */

import type { Plan } from "~/lib/utils/planSchema";

export type EvalQuery = {
  id: string;
  query: string;
  expectedNiche: string;
  expectedTemplateId?: string;
  mustHaveSections?: string[];
  expectedKeywordsAny?: string[];
};

export type MetricCheck = {
  name: string;
  passed: boolean;
  value?: number;
  detail?: string;
};

export type EvalCaseResult = {
  query: EvalQuery;
  plan: Plan | null;
  fewShotCount: number;
  usedReasoning: boolean;
  durationMs: number;
  error?: string;
  checks: MetricCheck[];
  passed: boolean;
};

export type EvalDifficulty = "easy" | "medium" | "hard" | "unknown";

export type EvalRunSummary = {
  total: number;
  passed: number;
  passRate: number;
  meanLatencyMs: number;
  avgNumericFacts: number;
  bannedPhraseRate: number;
  fewShotHitRate: number;
  templateMatchRate: number;
  perCheckPassRate: Record<string, number>;
  /**
   * Разбивка по категории сложности (префикс id запроса: easy-/med-/hard-).
   * С расширением корпуса до 100 queries (37+37+26) отдельный мониторинг качества
   * на hard-категории важен — иначе регрессии в graceful degradation растворяются
   * в общем шуме.
   * Опциональное поле — backward-compat для консьюмеров старой версии типа.
   */
  byDifficulty?: Partial<Record<EvalDifficulty, EvalRunSummary>>;
};

export type EvalRunOptions = {
  maxQueries?: number;
  disableRag?: boolean;
  disableReasoning?: boolean;
  providerOverride?: { modelName?: string };
  signal?: AbortSignal;
};

export type EvalRunReport = {
  runId: string;
  startedAt: number;
  finishedAt: number;
  totalMs: number;
  options: EvalRunOptions;
  summary: EvalRunSummary;
  cases: EvalCaseResult[];
};
