/**
 * Persistent storage отчётов eval-run-ов + diff между ними.
 *
 * JSONL append-only, один файл отчёта на запуск. Хранятся в eval-reports/
 * (gitignore). Manifest (eval-reports/manifest.jsonl) держит одну строку
 * на отчёт — для быстрой навигации без чтения всех файлов.
 *
 * diffSummaries сравнивает два summary (baseline vs current) и выдаёт
 * delta по ключевым метрикам + per-check pass rate. Используется в nightly
 * cron чтобы алертить когда passRate или has_pricing_when_expected падает.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { EvalRunReport, EvalRunSummary } from "./types";

const DEFAULT_DIR = "eval-reports";

function getReportsDir(): string {
  return process.env.NIT_EVAL_REPORTS_DIR ?? DEFAULT_DIR;
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

export type ManifestEntry = {
  runId: string;
  startedAt: number;
  finishedAt: number;
  totalMs: number;
  file: string;
  passRate: number;
  total: number;
  passed: number;
  fewShotHitRate: number;
  meanLatencyMs: number;
  perCheckPassRate: Record<string, number>;
  label?: string;
};

export async function saveReport(
  report: EvalRunReport,
  opts: { label?: string } = {},
): Promise<{ file: string; manifestFile: string }> {
  const dir = getReportsDir();
  await fs.mkdir(dir, { recursive: true });

  const stamp = formatStamp(report.startedAt);
  const safeLabel = opts.label ? `-${opts.label.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40)}` : "";
  const fileName = `${stamp}-${report.runId}${safeLabel}.json`;
  const filePath = path.join(dir, fileName);

  await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf8");

  const manifestEntry: ManifestEntry = {
    runId: report.runId,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    totalMs: report.totalMs,
    file: fileName,
    passRate: report.summary.passRate,
    total: report.summary.total,
    passed: report.summary.passed,
    fewShotHitRate: report.summary.fewShotHitRate,
    meanLatencyMs: report.summary.meanLatencyMs,
    perCheckPassRate: report.summary.perCheckPassRate,
    label: opts.label,
  };
  const manifestPath = path.join(dir, "manifest.jsonl");
  await fs.appendFile(manifestPath, JSON.stringify(manifestEntry) + "\n", "utf8");

  return { file: filePath, manifestFile: manifestPath };
}

export async function listReports(): Promise<ManifestEntry[]> {
  const dir = getReportsDir();
  const manifestPath = path.join(dir, "manifest.jsonl");
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    const entries: ManifestEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as ManifestEntry);
      } catch {
        // битая строка — пропуск
      }
    }
    return entries.sort((a, b) => a.startedAt - b.startedAt);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function loadReport(runIdOrFile: string): Promise<EvalRunReport | null> {
  const dir = getReportsDir();
  const direct = path.isAbsolute(runIdOrFile) ? runIdOrFile : path.join(dir, runIdOrFile);
  try {
    const content = await fs.readFile(direct, "utf8");
    return JSON.parse(content) as EvalRunReport;
  } catch {
    // fall through — попробуем как runId через manifest
  }
  const entries = await listReports();
  const match = entries.find((e) => e.runId === runIdOrFile);
  if (!match) return null;
  const content = await fs.readFile(path.join(dir, match.file), "utf8");
  return JSON.parse(content) as EvalRunReport;
}

export type SummaryDiffRow = {
  metric: string;
  before: number;
  after: number;
  delta: number;
  /** true если метрика улучшилась (зависит от направления — для latency меньше лучше). */
  improved: boolean;
};

export type SummaryDiff = {
  rows: SummaryDiffRow[];
  regressions: SummaryDiffRow[];
  improvements: SummaryDiffRow[];
};

const LOWER_IS_BETTER = new Set(["meanLatencyMs", "bannedPhraseRate"]);

function diffMetric(
  metric: string,
  before: number,
  after: number,
  regressionThreshold: number,
): SummaryDiffRow {
  const delta = Number((after - before).toFixed(4));
  const lowerBetter = LOWER_IS_BETTER.has(metric);
  const improved = lowerBetter ? delta < 0 : delta > 0;
  return { metric, before, after, delta, improved };
}

/**
 * Сравнивает два summary. regressionThreshold — минимальная абс. разница чтобы
 * считать метрику значимо изменившейся (default 0.02 = 2 п.п. pass rate).
 */
export function diffSummaries(
  before: EvalRunSummary,
  after: EvalRunSummary,
  regressionThreshold: number = 0.02,
): SummaryDiff {
  const rows: SummaryDiffRow[] = [];

  const topLevel: Array<keyof EvalRunSummary> = [
    "passRate",
    "meanLatencyMs",
    "avgNumericFacts",
    "bannedPhraseRate",
    "fewShotHitRate",
    "templateMatchRate",
  ];
  for (const key of topLevel) {
    const b = Number(before[key] ?? 0);
    const a = Number(after[key] ?? 0);
    rows.push(diffMetric(String(key), b, a, regressionThreshold));
  }

  const allCheckNames = new Set([
    ...Object.keys(before.perCheckPassRate ?? {}),
    ...Object.keys(after.perCheckPassRate ?? {}),
  ]);
  for (const name of allCheckNames) {
    const b = before.perCheckPassRate?.[name] ?? 0;
    const a = after.perCheckPassRate?.[name] ?? 0;
    rows.push(diffMetric(`check:${name}`, b, a, regressionThreshold));
  }

  const regressions: SummaryDiffRow[] = [];
  const improvements: SummaryDiffRow[] = [];
  for (const r of rows) {
    if (Math.abs(r.delta) < regressionThreshold) continue;
    if (r.improved) improvements.push(r);
    else regressions.push(r);
  }
  regressions.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  improvements.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return { rows, regressions, improvements };
}

/**
 * Форматирует diff в читаемый текст для stdout / Telegram / email уведомления.
 */
export function formatDiff(diff: SummaryDiff): string {
  const lines: string[] = [];
  if (diff.regressions.length === 0 && diff.improvements.length === 0) {
    return "Нет значимых изменений (delta < threshold).";
  }

  if (diff.regressions.length > 0) {
    lines.push("🔴 Регрессии:");
    for (const r of diff.regressions) {
      const sign = r.delta > 0 ? "+" : "";
      lines.push(`  ${r.metric}: ${r.before} → ${r.after} (${sign}${r.delta})`);
    }
  }

  if (diff.improvements.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("🟢 Улучшения:");
    for (const r of diff.improvements) {
      const sign = r.delta > 0 ? "+" : "";
      lines.push(`  ${r.metric}: ${r.before} → ${r.after} (${sign}${r.delta})`);
    }
  }

  return lines.join("\n");
}
