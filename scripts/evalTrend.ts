#!/usr/bin/env tsx
/**
 * Тренд-вьюэр для eval-reports/manifest.jsonl.
 *
 * Печатает таблицу последних N прогонов + sparkline для ключевых метрик.
 * Без зависимостей, чистый stdout — можно скромить grep-ом или скинуть в Telegram.
 *
 * Использование:
 *   npm run eval:trend
 *   npm run eval:trend -- --last=10 --label=nightly
 *
 * Опции:
 *   --last=N        последние N прогонов (default 10)
 *   --label=STRING  фильтр по label (например только nightly)
 *   --checks        показать тренд каждого per-check pass rate
 */

import { listReports, type ManifestEntry } from "../app/lib/eval/report";

const SPARK_CHARS = "▁▂▃▄▅▆▇█";

function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return SPARK_CHARS[3]!.repeat(values.length);
  return values
    .map((v) => {
      const n = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
      return SPARK_CHARS[n]!;
    })
    .join("");
}

type Args = {
  last: number;
  label?: string;
  checks: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { last: 10, checks: false };
  for (const a of argv) {
    if (a === "--checks") out.checks = true;
    else if (a.startsWith("--last=")) {
      const n = parseInt(a.slice("--last=".length), 10);
      if (!Number.isNaN(n) && n > 0) out.last = n;
    } else if (a.startsWith("--label=")) {
      out.label = a.slice("--label=".length);
    }
  }
  return out;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function pad(s: string | number, width: number, align: "left" | "right" = "left"): string {
  const str = String(s);
  if (str.length >= width) return str.slice(0, width);
  const padding = " ".repeat(width - str.length);
  return align === "left" ? str + padding : padding + str;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const all = await listReports();
  let filtered = all;
  if (args.label) {
    filtered = filtered.filter((e) => e.label === args.label);
  }

  if (filtered.length === 0) {
    console.log(
      args.label
        ? `Нет прогонов с label="${args.label}" в eval-reports/manifest.jsonl`
        : "Нет прогонов в eval-reports/manifest.jsonl (запусти npm run eval)",
    );
    return;
  }

  const recent = filtered.slice(-args.last);

  console.log("═".repeat(100));
  console.log(
    `NIT Builder — Eval Trend (последние ${recent.length} из ${filtered.length}${args.label ? ` с label=${args.label}` : ""})`,
  );
  console.log("═".repeat(100));

  console.log(
    `${pad("дата UTC", 18)}${pad("label", 14)}${pad("total", 7, "right")}${pad("pass", 7, "right")}${pad("rate", 8, "right")}${pad("few", 7, "right")}${pad("lat,ms", 9, "right")}  runId`,
  );
  console.log("─".repeat(100));

  for (const e of recent) {
    console.log(
      `${pad(fmtDate(e.startedAt), 18)}${pad(e.label ?? "-", 14)}${pad(e.total, 7, "right")}${pad(e.passed, 7, "right")}${pad(e.passRate, 8, "right")}${pad(e.fewShotHitRate, 7, "right")}${pad(e.meanLatencyMs, 9, "right")}  ${e.runId}`,
    );
  }

  console.log("");
  console.log("тренды (старые → новые):");
  const passRates = recent.map((e) => e.passRate);
  const latencies = recent.map((e) => e.meanLatencyMs);
  const fewShot = recent.map((e) => e.fewShotHitRate);
  console.log(
    `  passRate        ${sparkline(passRates)}  min=${Math.min(...passRates)} max=${Math.max(...passRates)} last=${passRates.at(-1)}`,
  );
  console.log(
    `  fewShotHitRate  ${sparkline(fewShot)}  min=${Math.min(...fewShot)} max=${Math.max(...fewShot)} last=${fewShot.at(-1)}`,
  );
  console.log(
    `  meanLatencyMs   ${sparkline(latencies)}  min=${Math.min(...latencies)} max=${Math.max(...latencies)} last=${latencies.at(-1)}`,
  );

  if (args.checks) {
    const allCheckNames = new Set<string>();
    for (const e of recent) {
      for (const name of Object.keys(e.perCheckPassRate ?? {})) allCheckNames.add(name);
    }
    if (allCheckNames.size > 0) {
      console.log("");
      console.log("per-check pass rate trends:");
      const names = Array.from(allCheckNames).sort();
      const namePad = Math.max(25, Math.min(45, ...names.map((n) => n.length)));
      for (const name of names) {
        const series = recent.map((e) => e.perCheckPassRate?.[name] ?? 0);
        const last = series.at(-1)!;
        const first = series[0]!;
        const delta = Number((last - first).toFixed(3));
        const deltaSign = delta > 0 ? "+" : "";
        const marker = Math.abs(delta) >= 0.1 ? (delta > 0 ? "🟢" : "🔴") : "  ";
        console.log(
          `  ${marker} ${pad(name, namePad)}  ${sparkline(series)}  last=${last}  Δ=${deltaSign}${delta}`,
        );
      }
    }
  }

  const last = recent.at(-1) as ManifestEntry;
  console.log("");
  console.log(`latest report file: eval-reports/${last.file}`);
}

main().catch((err) => {
  console.error("❌ evalTrend упал:", err);
  process.exit(2);
});
