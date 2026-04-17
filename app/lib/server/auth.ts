/**
 * Минимальная auth для v1. Одноюзерный режим с optional NIT_API_SECRET.
 * Multi-user добавим в v1.1 вместе с "Мои сайты".
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { isAppwriteConfigured, consumeGuestLimit } from "~/lib/server/appwrite.server";
import { getAuth } from "~/lib/server/requireAuth.server";
import { logger } from "~/lib/utils/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const COOKIE_NAME = "nit_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getSecret(): string | null {
  const s = process.env.NIT_API_SECRET?.trim();
  return s && s.length >= 8 ? s : null;
}

function deriveToken(secret: string): string {
  return createHash("sha256").update(`nit-builder:${secret}`).digest("hex").slice(0, 48);
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
  } catch {
    return false;
  }
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Сверка Bearer-токена с derived secret. Используется и в CSRF-чеке (для безопасного
 * пропуска заведомо валидного API-доступа), и в requireAuth.
 */
function isValidBearerToken(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const secret = getSecret();
  if (!secret) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const expected = deriveToken(secret);
  return safeCompare(token, secret) || safeCompare(token, expected);
}

// ─── CSRF ──────────────────────────────────────────
export function checkCsrf(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  // Bearer пропускает CSRF ТОЛЬКО если токен реально валидный.
  // Раньше было `if (auth?.startsWith("Bearer ")) return null;` — это значило
  // что любой POST с заголовком `Authorization: Bearer что-угодно` обходил
  // CSRF-проверку, и если NIT_API_SECRET не задан, попадал в гостевой поток
  // без origin/referer-валидации. Теперь Bearer без валидного токена
  // продолжает CSRF-проверку как обычный cookie-запрос.
  if (isValidBearerToken(request.headers.get("authorization"))) return null;

  const host = request.headers.get("host");
  if (!host) return null;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host === host) return null;
    } catch {}
    return Response.json({ error: "CSRF: origin mismatch" }, { status: 403 });
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).host === host) return null;
    } catch {}
    return Response.json({ error: "CSRF: referer mismatch" }, { status: 403 });
  }

  return null;
}

// ─── Auth ──────────────────────────────────────────
export function requireAuth(request: Request): Response | null {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const secret = getSecret();
  if (!secret) return null; // auth disabled

  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const expected = deriveToken(secret);
  if (safeCompare(cookies[COOKIE_NAME] ?? "", expected)) return null;

  if (isValidBearerToken(request.headers.get("authorization"))) return null;

  return Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
}

/**
 * Пропускает гостей. Async, потому что теперь проверяет Appwrite session cookie
 * в первую очередь через `getAuth` — раньше опирались только на legacy
 * NIT_API_SECRET cookie, и залогиненные через /api/auth/login юзеры считались
 * гостями (их cookie — Appwrite-формат, старый requireAuth его не признавал).
 *
 * Порядок проверки:
 *   1. Appwrite session cookie (новая система, primary)
 *   2. NIT_API_SECRET bearer/cookie (legacy, fallback для API-юзеров)
 *   3. Иначе — гость
 */
export async function authOrGuest(
  request: Request,
): Promise<{ isGuest: boolean; userId?: string; csrfError?: Response }> {
  const csrf = checkCsrf(request);
  if (csrf) return { isGuest: false, csrfError: csrf };

  // 1. Appwrite session cookie — primary auth path
  try {
    const user = await getAuth(request);
    if (user) return { isGuest: false, userId: user.userId };
  } catch {
    // getAuth ходит в Appwrite за деталями юзера — если Appwrite упал,
    // не роняем запрос, а пытаемся через legacy / пропускаем как гостя.
  }

  // 2. Legacy NIT_API_SECRET (bearer или cookie)
  const legacyResult = requireAuth(request);
  if (legacyResult === null) return { isGuest: false };

  // 3. Гость
  return { isGuest: true };
}

export function buildAuthCookie(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const token = deriveToken(secret);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function isAuthEnabled(): boolean {
  return getSecret() !== null;
}

// ─── Guest limit (by IP) ────────────────────────────
//
// Стратегия: Appwrite-first (persistent через PM2 reload), in-memory fallback
// если Appwrite не настроен ИЛИ упал. Fallback fail-open — лучше пропустить
// несколько лишних гостевых запросов чем уронить сайт из-за временной
// недоступности БД.

const guestCounts = new Map<string, { count: number; resetAt: number }>();
const GUEST_DAILY = parseInt(process.env.GUEST_DAILY_LIMIT ?? "10", 10);
const GUEST_WINDOW = 24 * 60 * 60 * 1000;

function getIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function checkGuestLimitInMemory(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = guestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + GUEST_WINDOW };
    guestCounts.set(ip, entry);
  }
  if (entry.count >= GUEST_DAILY) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: GUEST_DAILY - entry.count };
}

export async function checkGuestLimit(
  request: Request,
): Promise<{ allowed: boolean; remaining: number }> {
  const ip = getIp(request);

  if (isAppwriteConfigured()) {
    try {
      const r = await consumeGuestLimit(ip, GUEST_DAILY, GUEST_WINDOW);
      return { allowed: r.allowed, remaining: r.remaining };
    } catch (err) {
      // Appwrite недоступен — fall back на in-memory чтобы сайт не упал.
      // Логируем чтобы было видно в мониторинге.
      logger.warn(
        "auth",
        `Appwrite guest-limit failed, falling back to in-memory: ${(err as Error).message}`,
      );
      return checkGuestLimitInMemory(ip);
    }
  }

  return checkGuestLimitInMemory(ip);
}

/** Только для тестов: сброс in-memory guest-count карты. */
export function _resetGuestLimitState(): void {
  guestCounts.clear();
}
