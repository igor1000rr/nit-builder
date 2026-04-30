#!/usr/bin/env tsx
/**
 * HTML smoke runner: генерирует реальные HTML-сайты и проверяет итоговую
 * страницу, а не только Planner JSON.
 */

import { runHtmlSmokeSuite, DEFAULT_HTML_SMOKE_CASES } from "../app/lib/eval/htmlSmoke";

type Args = {
  outDir: string;
  label?: string;
  ids?: string[];
  models: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    outDir: process.env.NIT_HTML_SMOKE_DIR ?? "eval-reports/html-smoke",
    models: [process.env.LMSTUDIO_MODEL ?? "qwen2.5-coder-7b-instruct"],
  };

  for (const arg of argv) {
    if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--label=")) args.label = arg.slice("--label=".length);
    else if (arg.startsWith("--ids=")) {
      args.ids = arg.slice("--ids=".length).split(",").map((id) => id.trim()).filter(Boolean);
    } else if (arg.startsWith("--models=")) {
      args.models = arg.slice("--models=".length).split(",").map((id) => id.trim()).filter(Boolean);
    }
  }

  return args;
}

function formatSummary(report: Awaited<ReturnType<typeof runHtmlSmokeSuite>>): string[] {
  const lines = [
    `  model:         ${report.modelName ?? "-"}`,
    `  total:         ${report.summary.total}`,
    `  passed:        ${report.summary.passed}`,
    `  passRate:      ${report.summary.passRate}`,
    `  meanLatencyMs: ${report.summary.meanLatencyMs}`,
    `  outputDir:     ${report.outputDir}`,
  ];

  const failed = report.cases.filter((item) => !item.passed);
  if (failed.length > 0) {
    lines.push("  failures:");
    for (const item of failed) {
      const failedChecks = item.checks
        .filter((check) => !check.passed)
        .map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ""}`)
        .join("; ");
      lines.push(`    ${item.id}: ${failedChecks || item.error || "unknown"}`);
    }
  }

  const warningCount = report.cases.reduce((sum, item) => sum + item.warnings.length, 0);
  if (warningCount > 0) {
    lines.push(`  warnings:      ${warningCount}`);
  }

  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const selectedCases = args.ids
    ? DEFAULT_HTML_SMOKE_CASES.filter((item) => args.ids!.includes(item.id))
    : DEFAULT_HTML_SMOKE_CASES;

  if (selectedCases.length === 0) {
    throw new Error("No HTML smoke cases selected");
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("NIT Builder — HTML Smoke Runner");
  console.log("═══════════════════════════════════════════════════");
  console.log(`cases=${selectedCases.length}, models=${args.models.join(", ")}, outDir=${args.outDir}`);

  let hasFailure = false;
  for (const modelName of args.models) {
    const runId = [
      new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, ""),
      modelName.replace(/[^\w.-]+/g, "_"),
      args.label,
    ].filter(Boolean).join("-");

    const report = await runHtmlSmokeSuite({
      cases: selectedCases,
      outputDir: args.outDir,
      modelName,
      runId,
    });

    console.log("");
    console.log("═══ SUMMARY ═══");
    for (const line of formatSummary(report)) console.log(line);
    if (report.summary.passed < report.summary.total) hasFailure = true;
  }

  if (hasFailure) process.exit(1);
}

main().catch((err) => {
  console.error("HTML smoke runner failed:", err);
  process.exit(2);
});
