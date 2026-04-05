/**
 * Минимальный Prometheus-совместимый сборщик метрик.
 * In-memory, без зависимостей. Для production с multi-instance — заменить на Redis.
 */

type Counter = { value: number; labels?: Record<string, string> };
type Histogram = { count: number; sum: number; buckets: Map<number, number> };

// Counters
const counters = new Map<string, Counter>();
// Histograms (latency in ms)
const histograms = new Map<string, Histogram>();

// Process start time for uptime metric
const PROCESS_START = Date.now();

// Histogram buckets in milliseconds — typical LLM latency range
const DEFAULT_BUCKETS = [100, 500, 1000, 2000, 5000, 10_000, 20_000, 30_000, 60_000, 120_000];

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

export function observeHistogram(name: string, value: number): void {
  let h = histograms.get(name);
  if (!h) {
    h = { count: 0, sum: 0, buckets: new Map(DEFAULT_BUCKETS.map((b) => [b, 0])) };
    histograms.set(name, h);
  }
  h.count++;
  h.sum += value;
  for (const bucket of DEFAULT_BUCKETS) {
    if (value <= bucket) {
      h.buckets.set(bucket, (h.buckets.get(bucket) ?? 0) + 1);
    }
  }
}

/** Метрики-хелперы для типичных событий NIT Builder */
export const metrics = {
  generationStarted: (mode: "create" | "polish", provider: string) => {
    incrementCounter("nit_generations_total", { mode, provider });
  },
  generationCompleted: (mode: "create" | "polish", provider: string, durationMs: number) => {
    incrementCounter("nit_generations_completed_total", { mode, provider });
    observeHistogram("nit_generation_duration_ms", durationMs);
  },
  generationFailed: (mode: "create" | "polish", reason: string) => {
    incrementCounter("nit_generations_failed_total", { mode, reason });
  },
  templateSelected: (templateId: string) => {
    incrementCounter("nit_template_selections_total", { template: templateId });
  },
  rateLimited: (scope: string) => {
    incrementCounter("nit_rate_limited_total", { scope });
  },
};

/** Prometheus text exposition format */
export function exportMetrics(): string {
  const lines: string[] = [];

  // Process info
  lines.push("# HELP nit_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE nit_uptime_seconds gauge");
  lines.push(`nit_uptime_seconds ${((Date.now() - PROCESS_START) / 1000).toFixed(0)}`);
  lines.push("");

  lines.push("# HELP nit_memory_heap_used_bytes Heap memory used");
  lines.push("# TYPE nit_memory_heap_used_bytes gauge");
  lines.push(`nit_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`);
  lines.push("");

  // Counters
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

  // Histograms
  for (const [name, h] of histograms) {
    lines.push(`# HELP ${name} Histogram`);
    lines.push(`# TYPE ${name} histogram`);
    let cumulative = 0;
    for (const bucket of DEFAULT_BUCKETS) {
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
