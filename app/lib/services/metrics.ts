/**
 * Минимальный Prometheus-совместимый сборщик метрик.
 * In-memory, без зависимостей. Для production с multi-instance — заменить на Redis.
 */

type Counter = { value: number; labels?: Record<string, string> };
type Histogram = { count: number; sum: number; buckets: Map<number, number> };

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();

const PROCESS_START = Date.now();

const DEFAULT_BUCKETS = [100, 500, 1000, 2000, 5000, 10_000, 20_000, 30_000, 60_000, 120_000];
const RULE_COUNT_BUCKETS = [1, 2, 3, 5, 8, 13, 20];
const TOKEN_BUCKETS = [100, 250, 500, 1000, 2000, 5000, 10_000, 20_000];
const PRUNE_BUCKETS = [0, 1, 2, 3, 5, 8, 13];
const FILL_RATIO_BUCKETS = [0.25, 0.5, 0.6, 0.75, 0.9, 1.0];

function counterKey(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return `${name}{${labelStr}}`;
}

export function incrementCounter(
  name: string,
  labels?: Record<string, string>,
  amount: number = 1,
): void {
  const key = counterKey(name, labels);
  const existing = counters.get(key);
  if (existing) {
    existing.value += amount;
  } else {
    counters.set(key, { value: amount, labels });
  }
}

export function observeHistogram(
  name: string,
  value: number,
  buckets: number[] = DEFAULT_BUCKETS,
): void {
  let h = histograms.get(name);
  if (!h) {
    h = { count: 0, sum: 0, buckets: new Map(buckets.map((b) => [b, 0])) };
    histograms.set(name, h);
  }
  h.count++;
  h.sum += value;
  for (const bucket of buckets) {
    if (value <= bucket) {
      h.buckets.set(bucket, (h.buckets.get(bucket) ?? 0) + 1);
    }
  }
}

export const metrics = {
  generationStarted: (mode: "create" | "polish" | "continue", provider: string) => {
    incrementCounter("nit_generations_total", { mode, provider });
  },
  generationCompleted: (
    mode: "create" | "polish" | "continue",
    provider: string,
    durationMs: number,
  ) => {
    incrementCounter("nit_generations_completed_total", { mode, provider });
    observeHistogram("nit_generation_duration_ms", durationMs);
  },
  generationFailed: (mode: "create" | "polish" | "continue", reason: string) => {
    incrementCounter("nit_generations_failed_total", { mode, reason });
  },
  /** Генерация оборвалась по лимиту токенов (finish_reason=length). Ключ к калибровке maxOutputTokens. */
  generationTruncated: (mode: "create" | "polish" | "continue") => {
    incrementCounter("nit_generations_truncated_total", { mode });
  },
  templateSelected: (templateId: string) => {
    incrementCounter("nit_template_selections_total", { template: templateId });
  },
  /** Сколько секций вырезали из шаблона до подачи в Coder (токен-экономия). */
  templatePruned: (removedCount: number) => {
    observeHistogram("nit_template_sections_pruned", removedCount, PRUNE_BUCKETS);
  },
  rateLimited: (scope: string) => {
    incrementCounter("nit_rate_limited_total", { scope });
  },
  polishIntent: (intent: "css_patch" | "full_rewrite", targeted: boolean) => {
    incrementCounter("nit_polish_intent_total", {
      intent,
      targeted: targeted ? "1" : "0",
    });
  },
  polishSectionTarget: (section: string) => {
    incrementCounter("nit_polish_section_target_total", { section });
  },
  patchRulesGenerated: (count: number) => {
    observeHistogram("nit_patch_rules_per_request", count, RULE_COUNT_BUCKETS);
  },
  cssPatchFallback: (reason: string) => {
    incrementCounter("nit_css_patch_fallback_total", { reason });
  },
  planCacheHit: () => {
    incrementCounter("nit_plan_cache_hits_total");
  },
  planCacheMiss: () => {
    incrementCounter("nit_plan_cache_misses_total");
  },
  /** Skeleton-injection была попытана (вызывается на каждой create-генерации). */
  skeletonInjectAttempted: () => {
    incrementCounter("nit_skeleton_inject_attempted_total");
  },
  /** Skeleton-injection успешна, Coder НЕ вызывался. */
  skeletonInjectSucceeded: (templateId: string, fillRatio: number) => {
    incrementCounter("nit_skeleton_inject_succeeded_total", { template: templateId });
    observeHistogram("nit_skeleton_inject_fill_ratio", fillRatio, FILL_RATIO_BUCKETS);
  },
  /** Skeleton-injection пропущена — fallback на Coder. reason из InjectionResult. */
  skeletonInjectSkipped: (reason: string) => {
    incrementCounter("nit_skeleton_inject_skipped_total", { reason });
  },
  /**
   * Токены с реального usage-объекта из ai SDK. kind="prompt"|"completion".
   * Счётчик+гистограмма: счётчик покажет суммарный burn, гистограмма — распределение.
   */
  tokensUsed: (mode: "create" | "polish" | "continue", kind: "prompt" | "completion", count: number) => {
    if (count <= 0) return;
    incrementCounter("nit_tokens_total", { mode, kind }, count);
    observeHistogram("nit_tokens_per_request", count, TOKEN_BUCKETS);
  },
};

export function exportMetrics(): string {
  const lines: string[] = [];

  lines.push("# HELP nit_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE nit_uptime_seconds gauge");
  lines.push(`nit_uptime_seconds ${((Date.now() - PROCESS_START) / 1000).toFixed(0)}`);
  lines.push("");

  lines.push("# HELP nit_memory_heap_used_bytes Heap memory used");
  lines.push("# TYPE nit_memory_heap_used_bytes gauge");
  lines.push(`nit_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`);
  lines.push("");

  const counterNames = new Set<string>();
  for (const [key] of counters) {
    counterNames.add(key.split("{")[0]!);
  }

  for (const name of counterNames) {
    lines.push(`# HELP ${name} Counter`);
    lines.push(`# TYPE ${name} counter`);
    for (const [key, counter] of counters) {
      if (key === name || key.startsWith(`${name}{`)) {
        lines.push(`${key} ${counter.value}`);
      }
    }
    lines.push("");
  }

  for (const [name, h] of histograms) {
    lines.push(`# HELP ${name} Histogram`);
    lines.push(`# TYPE ${name} histogram`);
    const bucketList = Array.from(h.buckets.keys()).sort((a, b) => a - b);
    let cumulative = 0;
    for (const bucket of bucketList) {
      cumulative = h.buckets.get(bucket) ?? cumulative;
      lines.push(`${name}_bucket{le="${bucket}"} ${cumulative}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
    lines.push(`${name}_sum ${h.sum.toFixed(0)}`);
    lines.push(`${name}_count ${h.count}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}
