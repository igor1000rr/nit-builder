import { logger } from "~/lib/utils/logger";
import { getPreferredProvider, getModel } from "~/lib/llm/client";
import { runPlannerForEval } from "~/lib/services/htmlOrchestrator";
import { EVAL_QUERIES } from "./queries";
import { evaluatePlan } from "./metrics";
import type {
  EvalCaseResult,
  EvalDifficulty,
  EvalQuery,
  EvalRunOptions,
  EvalRunReport,
  EvalRunSummary,
} from "./types";

const SCOPE = "evalRunner";

function generateRunId(): string {
  return `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Категоризация запроса по префиксу id (согласовано с организацией queries.ts).
 * Неизвестные префиксы — "unknown" (не влияет на основные категории).
 */
function categorizeDifficulty(id: string): EvalDifficulty {
  if (id.startsWith("easy-")) return "easy";
  if (id.startsWith("med-")) return "medium";
  if (id.startsWith("hard-")) return "hard";
  return "unknown";
}

async function runOneCase(
  query: EvalQuery,
  modelHandle: ReturnType<typeof getModel>,
  modelName: string,
  signal: AbortSignal,
): Promise<EvalCaseResult> {
  const startMs = Date.now();
  try {
    const result = await runPlannerForEval({
      model: modelHandle,
      modelName,
      sanitizedMessage: query.query,
      signal,
    });
    const durationMs = Date.now() - startMs;

    if (!result.plan) {
      return {
        query,
        plan: null,
        fewShotCount: result.fewShotCount,
        usedReasoning: result.usedReasoning,
        durationMs,
        error: result.error ?? "plan is null",
        checks: [],
        passed: false,
      };
    }

    const checks = evaluatePlan(result.plan, query);
    const passed = checks.every((c) => c.passed);

    return {
      query,
      plan: result.plan,
      fewShotCount: result.fewShotCount,
      usedReasoning: result.usedReasoning,
      durationMs,
      checks,
      passed,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return {
      query,
      plan: null,
      fewShotCount: 0,
      usedReasoning: false,
      durationMs: Date.now() - startMs,
      error: (err as Error).message,
      checks: [],
      passed: false,
    };
  }
}

function aggregate(cases: EvalCaseResult[]): EvalRunSummary {
  const total = cases.length;
  if (total === 0) {
    return {
      total: 0,
      passed: 0,
      passRate: 0,
      meanLatencyMs: 0,
      avgNumericFacts: 0,
      bannedPhraseRate: 0,
      fewShotHitRate: 0,
      templateMatchRate: 0,
      perCheckPassRate: {},
    };
  }

  const passed = cases.filter((c) => c.passed).length;
  const meanLatencyMs = Math.round(
    cases.reduce((s, c) => s + c.durationMs, 0) / total,
  );

  const numericFactsValues = cases
    .map((c) => c.checks.find((ck) => ck.name === "benefits_have_numeric_facts")?.value ?? 0)
    .filter((v) => v !== undefined);
  const avgNumericFacts =
    numericFactsValues.length > 0
      ? Number(
          (
            numericFactsValues.reduce((s, v) => s + v, 0) / numericFactsValues.length
          ).toFixed(2),
        )
      : 0;

  const bannedHits = cases.filter(
    (c) => (c.checks.find((ck) => ck.name === "no_banned_phrases")?.value ?? 0) > 0,
  ).length;
  const bannedPhraseRate = Number((bannedHits / total).toFixed(3));

  const fewShotHits = cases.filter((c) => c.fewShotCount > 0).length;
  const fewShotHitRate = Number((fewShotHits / total).toFixed(3));

  const templateChecks = cases.filter((c) =>
    c.checks.find((ck) => ck.name === "template_match"),
  );
  const templateMatches = templateChecks.filter((c) =>
    c.checks.find((ck) => ck.name === "template_match")?.passed,
  ).length;
  const templateMatchRate =
    templateChecks.length > 0
      ? Number((templateMatches / templateChecks.length).toFixed(3))
      : 0;

  const perCheckPassRate: Record<string, number> = {};
  const checkNames = new Set<string>();
  for (const c of cases) for (const ck of c.checks) checkNames.add(ck.name);
  for (const name of checkNames) {
    const applicable = cases.filter((c) => c.checks.find((ck) => ck.name === name));
    if (applicable.length === 0) continue;
    const passedCount = applicable.filter(
      (c) => c.checks.find((ck) => ck.name === name)?.passed,
    ).length;
    perCheckPassRate[name] = Number((passedCount / applicable.length).toFixed(3));
  }

  return {
    total,
    passed,
    passRate: Number((passed / total).toFixed(3)),
    meanLatencyMs,
    avgNumericFacts,
    bannedPhraseRate,
    fewShotHitRate,
    templateMatchRate,
    perCheckPassRate,
  };
}

/**
 * Разбить cases по категориям сложности и агрегировать отдельно.
 * Пустые категории опускаются.
 */
function aggregateByDifficulty(
  cases: EvalCaseResult[],
): Partial<Record<EvalDifficulty, EvalRunSummary>> {
  const groups: Record<EvalDifficulty, EvalCaseResult[]> = {
    easy: [],
    medium: [],
    hard: [],
    unknown: [],
  };
  for (const c of cases) {
    const cat = categorizeDifficulty(c.query.id);
    groups[cat].push(c);
  }
  const result: Partial<Record<EvalDifficulty, EvalRunSummary>> = {};
  for (const cat of ["easy", "medium", "hard", "unknown"] as EvalDifficulty[]) {
    if (groups[cat].length > 0) {
      result[cat] = aggregate(groups[cat]);
    }
  }
  return result;
}

export async function runEvalSuite(opts: EvalRunOptions = {}): Promise<EvalRunReport> {
  const provider = getPreferredProvider(opts.providerOverride);
  if (!provider) throw new Error("Нет доступного LLM провайдера");

  const modelHandle = getModel(provider);
  const modelName = provider.defaultModel;
  const queries = opts.maxQueries
    ? EVAL_QUERIES.slice(0, opts.maxQueries)
    : EVAL_QUERIES;

  const originalRagEnabled = process.env.NIT_RAG_ENABLED;
  const originalReasoningEnabled = process.env.NIT_PLAN_REASONING_ENABLED;
  if (opts.disableRag) process.env.NIT_RAG_ENABLED = "0";
  if (opts.disableReasoning) process.env.NIT_PLAN_REASONING_ENABLED = "0";

  const runId = generateRunId();
  const startedAt = Date.now();
  logger.info(
    SCOPE,
    `Run ${runId} started: queries=${queries.length}, disableRag=${!!opts.disableRag}, disableReasoning=${!!opts.disableReasoning}`,
  );

  const cases: EvalCaseResult[] = [];
  try {
    for (const query of queries) {
      if (opts.signal?.aborted) throw new Error("AbortError");
      const caseResult = await runOneCase(
        query,
        modelHandle,
        modelName,
        opts.signal ?? new AbortController().signal,
      );
      cases.push(caseResult);
      logger.info(
        SCOPE,
        `[${runId}] ${query.id}: ${caseResult.passed ? "PASS" : "FAIL"} (${caseResult.durationMs}ms, fewShot=${caseResult.fewShotCount})`,
      );
    }
  } finally {
    if (originalRagEnabled === undefined) delete process.env.NIT_RAG_ENABLED;
    else process.env.NIT_RAG_ENABLED = originalRagEnabled;
    if (originalReasoningEnabled === undefined) delete process.env.NIT_PLAN_REASONING_ENABLED;
    else process.env.NIT_PLAN_REASONING_ENABLED = originalReasoningEnabled;
  }

  const finishedAt = Date.now();
  const summary = aggregate(cases);
  summary.byDifficulty = aggregateByDifficulty(cases);

  const breakdown = Object.entries(summary.byDifficulty)
    .map(
      ([cat, s]) =>
        `${cat}=${s!.passed}/${s!.total} (pass=${s!.passRate}, fewShot=${s!.fewShotHitRate})`,
    )
    .join(", ");
  logger.info(
    SCOPE,
    `Run ${runId} done in ${finishedAt - startedAt}ms: passRate=${summary.passRate}, fewShotHitRate=${summary.fewShotHitRate} | ${breakdown}`,
  );

  return {
    runId,
    startedAt,
    finishedAt,
    totalMs: finishedAt - startedAt,
    options: { ...opts, signal: undefined },
    summary,
    cases,
  };
}
