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
  /** Уникальный id для логов и сравнений между runs. */
  id: string;
  /** Естественно-языковой запрос как от пользователя. */
  query: string;
  /** Ниша — для сверки попадания в RAG few-shot и template selection. */
  expectedNiche: string;
  /** Опционально: если задан — проверяем что Planner выбрал именно его. */
  expectedTemplateId?: string;
  /** Опционально: секции которые ОБЯЗАНЫ быть в plan.sections. */
  mustHaveSections?: string[];
  /** Опционально: ключевые слова которые должны быть в plan.keywords (любое). */
  expectedKeywordsAny?: string[];
};

/** Результат проверки одной метрики на одном плане. */
export type MetricCheck = {
  name: string;
  passed: boolean;
  /** Опциональное число (для агрегации средних): кол-во цифр, длина и т.д. */
  value?: number;
  /** Опциональное пояснение почему упал чек (для дебага). */
  detail?: string;
};

export type EvalCaseResult = {
  query: EvalQuery;
  /** Сгенерированный план. null если генерация упала. */
  plan: Plan | null;
  /** Сколько few-shot примеров RAG подмешал в Planner. */
  fewShotCount: number;
  /** Был ли использован двухшаговый reasoning. */
  usedReasoning: boolean;
  /** Длительность Planner в ms (от вызова obtainPlan до результата). */
  durationMs: number;
  /** Если упало — текст ошибки. */
  error?: string;
  /** Список всех чеков. Все должны passed=true для overall pass. */
  checks: MetricCheck[];
  /** Прошли ли все чеки. */
  passed: boolean;
};

export type EvalRunSummary = {
  /** Сколько queries прогнали. */
  total: number;
  /** Сколько прошли все чеки. */
  passed: number;
  /** Доля проходов 0..1. */
  passRate: number;
  /** Средняя длительность Planner ms. */
  meanLatencyMs: number;
  /** Средняя плотность числовых фактов в benefits (на план). */
  avgNumericFacts: number;
  /** Доля планов где найден хотя бы 1 banned phrase. */
  bannedPhraseRate: number;
  /** Доля случаев где RAG подмешал хоть один few-shot пример. */
  fewShotHitRate: number;
  /** Доля случаев где template_id совпал с expected (если был задан). */
  templateMatchRate: number;
  /** Per-check агрегаты: name → passRate. */
  perCheckPassRate: Record<string, number>;
};

export type EvalRunOptions = {
  /** Сколько queries прогнать (default: все). Полезно для smoke-теста. */
  maxQueries?: number;
  /** Отключить RAG few-shot для baseline сравнения. */
  disableRag?: boolean;
  /** Отключить two-step reasoning (для сравнения impact). */
  disableReasoning?: boolean;
  /** Override модели/провайдера. */
  providerOverride?: { modelName?: string };
  /** AbortSignal для отмены долгого прогона. */
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
