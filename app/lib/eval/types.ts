/**
 * Типы для eval-pipeline.
 */

import type { Plan } from "~/lib/utils/planSchema";

export type EvalQuery = {
  id: string;
  query: string;
  expectedNiche: string;
  expectedTemplateId?: string;
  mustHaveSections?: string[];
  expectedKeywordsAny?: string[];

  // ─── Tier 4: ожидания extended-полей ───
  // Если указано true, добавляется соответствующий check has_X_when_expected.
  // Используется для измерения adoption Planner-ом расширенных полей.
  // Когда query явно намекает на прайс/FAQ/часы/контакты — план должен их выдавать.

  /** Запрос намекает на тарифы/прайс — план должен содержать pricing_tiers (>=2). */
  expectsPricing?: boolean;
  /** Запрос намекает на FAQ/частые вопросы — план должен содержать faq (>=3). */
  expectsFaq?: boolean;
  /** Бизнес явно оффлайновый с режимом работы — план должен содержать hours_text. */
  expectsHours?: boolean;
  /** Бизнес явно оффлайновый с физическим адресом — план должен содержать contact_phone. */
  expectsContactPhone?: boolean;
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

export type EvalDifficulty = "easy" | "medium" | "hard" | "ext" | "unknown";

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
   * Разбивка по категории сложности (префикс id запроса: easy-/med-/hard-/ext-).
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
