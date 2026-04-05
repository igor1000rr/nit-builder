const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_ENTRIES = 50_000;

type Entry = { timestamps: number[] };
const store = new Map<string, Entry>();

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - DEFAULT_WINDOW_MS * 2;
  for (const [key, entry] of store) {
    const latest = entry.timestamps[entry.timestamps.length - 1] ?? 0;
    if (latest < cutoff) store.delete(key);
  }
}, 5 * 60 * 1000);

if (typeof process !== "undefined") {
  process.on?.("SIGTERM", () => clearInterval(cleanupTimer));
  process.on?.("SIGINT", () => clearInterval(cleanupTimer));
}

function getClientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
};

export function checkRateLimit(
  request: Request,
  options?: { maxRequests?: number; windowMs?: number; scope?: string },
): RateLimitResult {
  const max = options?.maxRequests ?? DEFAULT_MAX;
  const window = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const scope = options?.scope ?? "default";
  const key = `${scope}:${getClientKey(request)}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry) {
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest) store.delete(oldest);
    }
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  const cutoff = now - window;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= max) {
    const oldest = entry.timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + window - now),
    };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: max - entry.timestamps.length };
}
