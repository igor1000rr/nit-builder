type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, scope: string, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

export const logger = {
  debug: (scope: string, message: string, meta?: unknown) => {
    if (process.env.LOG_LEVEL === "debug") log("debug", scope, message, meta);
  },
  info: (scope: string, message: string, meta?: unknown) => log("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => log("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => log("error", scope, message, meta),
};

export async function withLogContext<T>(
  ctx: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  // В MVP просто пробрасываем — без AsyncLocalStorage.
  // Если нужен request-scoped контекст — заменить на AsyncLocalStorage.
  void ctx;
  return fn();
}
