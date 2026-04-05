/**
 * Минимальная auth для v1. Одноюзерный режим с optional NIT_API_SECRET.
 * Multi-user добавим в v1.1 вместе с "Мои сайты".
 */

import { createHash, timingSafeEqual } from "node:crypto";

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

// ─── CSRF ────────────────────────────────────────────
export function checkCsrf(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return null;

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

// ─── Auth ────────────────────────────────────────────
export function requireAuth(request: Request): Response | null {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const secret = getSecret();
  if (!secret) return null; // auth disabled

  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const expected = deriveToken(secret);
  if (safeCompare(cookies[COOKIE_NAME] ?? "", expected)) return null;

  const auth = request.headers.get("authorization");
  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (safeCompare(token, secret) || safeCompare(token, expected)) return null;
  }

  return Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
}

/**
 * Пропускает гостей. Для MVP hosts всегда гость = true, если secret не задан.
 */
export function authOrGuest(request: Request): { isGuest: boolean; csrfError?: Response } {
  const csrf = checkCsrf(request);
  if (csrf) return { isGuest: false, csrfError: csrf };

  const result = requireAuth(request);
  return { isGuest: result !== null };
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

// ─── Guest limit (by IP) ─────────────────────────────
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

export function checkGuestLimit(request: Request): { allowed: boolean; remaining: number } {
  const ip = getIp(request);
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
