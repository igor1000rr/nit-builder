#!/usr/bin/env tsx
/**
 * CLI-обёртка над runEvalSuite.
 *
 * Использование:
 *   tsx scripts/runEval.ts [options]
 *   npm run eval -- [options]
 *
 * Опции:
 *   --max=N                    прогнать только первые N query (быстрый smoke)
 *   --disable-rag              отключить few-shot (baseline measurement)
 *   --disable-reasoning        отключить planner reasoning
 *   --disable-boost            отключить extended trigger boost (ablation A/B)
 *   --label=STRING             метка прогона (попадает в имя файла отчёта)
 *   --no-save                  не сохранять JSON-отчёт
 *   --compare=RUN_ID_OR_FILE   сравнить с предыдущим отчётом (diff в stdout)
 *   --compare-last             сравнить с последним прогоном из manifest
 *   --fail-on-regression       exit-code 1 если есть регрессии после compare
 *
 * ENV:
 *   NIT_EVAL_REPORTS_DIR       куда писать отчёты (default eval-reports/)
 *   LMSTUDIO_BASE_URL / GROQ_API_KEY — обычные LLM credentials
 *   RAG/reranker/boost kill-switches
 *
 * Пример cron nightly:
 *   0 3 * * * cd /root/nit-builder && npm run eval -- --label=nightly --compare-last --fail-on-regression >> /var/log/nit-eval.log 2>&1
 */

import { runEvalSuite } from "../app/lib/eval/runner";
import {
  saveReport,
  listReports,
  loadReport,
  diffSummaries,
  formatDiff,
} from "../app/lib/eval/report";

type Args = {
  max?: number;
  disableRag: boolean;
  disableReasoning: boolean;
  disableBoost: boolean;
  label?: string;
  save: boolean;
  compare?: string;
  compareLast: boolean;
  failOnRegression: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    disableRag: false,
    disableReasoning: false,
    disableBoost: false,
    save: true,
    compareLast: false,
    failOnRegression: false,
  };

  for (const a of argv) {
    if (a === "--disable-rag") out.disableRag = true;
    else if (a === "--disable-reasoning") out.disableReasoning = true;
    else if (a === "--disable-boost") out.disableBoost = true;
    else if (a === "--no-save") out.save = false;
    else if (a === "--compare-last") out.compareLast = true;
    else if (a === "--fail-on-regression") out.failOnRegression = true;
    else if (a.startsWith("--max=")) {
      const n = parseInt(a.slice("--max=".length), 10);
      if (!Number.isNaN(n) && n > 0) out.max = n;
    } else if (a.startsWith("--label=")) {
      out.label = a.slice("--label=".length);
    } else if (a.startsWith("--compare=")) {
      out.compare = a.slice("--compare=".length);
    }
  }

  return out;
}

function formatSummary(s: import("../app/lib/eval/types").EvalRunSummary): string[] {
  const lines: string[] = [];
  lines.push(`  total:             ${s.total}`);
  lines.push(`  passed:            ${s.passed}`);
  lines.push(`  passRate:          ${s.passRate}`);
  lines.push(`  meanLatencyMs:     ${s.meanLatencyMs}`);
  lines.push(`  fewShotHitRate:    ${s.fewShotHitRate}`);
  lines.push(`  bannedPhraseRate:  ${s.bannedPhraseRate}`);
  lines.push(`  avgNumericFacts:   ${s.avgNumericFacts}`);
  lines.push(`  templateMatchRate: ${s.templateMatchRate}`);
  if (s.byDifficulty) {
    lines.push(`  byDifficulty:`);
    for (const [cat, sub] of Object.entries(s.byDifficulty)) {
      if (!sub) continue;
      lines.push(`    ${cat}: pass=${sub.passed}/${sub.total} (${sub.passRate}), fewShot=${sub.fewShotHitRate}`);
    }
  }
  lines.push(`  per-check pass rate (топ 10):`);
  const entries = Object.entries(s.perCheckPassRate).sort((a, b) => a[1] - b[1]);
  for (const [name, rate] of entries.slice(0, 10)) {
    lines.push(`    ${name}: ${rate}`);
  }
  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.disableBoost) {
    process.env.NIT_EXTENDED_TRIGGER_BOOST_ENABLED = "0";
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("NIT Builder — Eval Runner");
  console.log("═══════════════════════════════════════════════════");
  console.log(`options: max=${args.max ?? "all"}, disableRag=${args.disableRag}, disableReasoning=${args.disableReasoning}, disableBoost=${args.disableBoost}, label=${args.label ?? "-"}`);
  console.log("");

  const startWallMs = Date.now();
  const report = await runEvalSuite({
    maxQueries: args.max,
    disableRag: args.disableRag,
    disableReasoning: args.disableReasoning,
  });
  const wallMs = Date.now() - startWallMs;

  console.log("");
  console.log("═══ SUMMARY ═══");
  for (const line of formatSummary(report.summary)) console.log(line);
  console.log("");
  console.log(`wall-clock time: ${wallMs}ms  (run totalMs: ${report.totalMs}ms)`);

  let savedFile: string | undefined;
  if (args.save) {
    const { file } = await saveReport(report, { label: args.label });
    savedFile = file;
    console.log(`saved report: ${file}`);
  }

  let hasRegression = false;
  if (args.compare || args.compareLast) {
    let baselineId = args.compare;
    if (!baselineId && args.compareLast) {
      const list = await listReports();
      // Последняя — сам этот прогон (только что записан). Берём предыдущий.
      const prev = list.filter((e) => e.runId !== report.runId).at(-1);
      if (!prev) {
        console.log("\ncompare-last: нет предыдущих прогонов для сравнения.");
      } else {
        baselineId = prev.runId;
        console.log(`\ncompare-last: сравниваем с ${prev.runId} (${prev.file})`);
      }
    }

    if (baselineId) {
      const baseline = await loadReport(baselineId);
      if (!baseline) {
        console.error(`❌ не нашёл отчёт для сравнения: ${baselineId}`);
        process.exit(2);
      }
      const diff = diffSummaries(baseline.summary, report.summary);
      console.log("");
      console.log("═══ DIFF ═══");
      console.log(formatDiff(diff));
      hasRegression = diff.regressions.length > 0;
    }
  }

  if (hasRegression && args.failOnRegression) {
    console.error("\n❌ Регрессии обнаружены, exit 1 (--fail-on-regression)");
    process.exit(1);
  }

  if (savedFile) {
    // ничего дополнительно, просто чтобы не ругался линтер на unused
  }
}

main().catch((err) => {
  console.error("❌ Eval runner упал:", err);
  process.exit(2);
});
