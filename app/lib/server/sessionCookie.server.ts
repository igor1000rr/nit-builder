/**
 * Session cookie — signed stateless tokens WITH session-version revocation.
 *
 * Format v2 (сейчас):  userId.sessionVersion.expiryUnixSec.hmacHex (4 части)
 * Format v1 (legacy):  userId.expiryUnixSec.hmacHex (3 части)
 *
 * Legacy-токены принимаются с sessionVersion=0 чтобы при деплое новой
 * версии сервера существующие юзеры не выкинулись. При следующем login им
 * выпишется v2-токен. При первом bumpSessionVersion любые legacy-токены того
 * юзера станут невалидны (версия в них = 0, а у юзера уже ≥ 1).
 *
 * sessionVersion хранится в nit_users.sessionVersion. При bumpSessionVersion()
 * (например через /api/auth/logout-all или при смене пароля) версия
 * инкрементируется — все ранее выданные токены перестают проходить verify (их
 * version < current). Без этого механизма logout-all невозможен при
 * stateless-токенах: HMAC валиден пока не истёк expiry (30 дней), и сервер
 * не мог отличить старый токен от свежего.
 *
 * Проверка version vs current делается в requireAuth.server.ts (getAuth),
 * этот файл только кодирует/декодирует токен.
 *
 * Security:
 * - HMAC-SHA256 с NIT_TOKEN_LOOKUP_SECRET
 * - HttpOnly cookie — JavaScript can't read it (XSS protection)
 * - SameSite=Lax — CSRF protection, still works on top-level navigation
 * - Secure flag added in production (HTTPS only)
 * - 30 day expiry, embedded in the signed payload (not just cookie Max-Age)
 * - Constant-time signature comparison via crypto.timingSafeEqual
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "nit_session" as const;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  const secret = process.env.NIT_TOKEN_LOOKUP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "NIT_TOKEN_LOOKUP_SECRET env var missing or too short (need 32+ chars). " +
        "Generate with: openssl rand -hex 32",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export type VerifiedSession = {
  userId: string;
  sessionVersion: number;
};

/**
 * Create a signed session token for the given user.
 * Format: `userId.sessionVersion.expiryUnixSec.hmacHex`
 */
export function createSessionToken(userId: string, sessionVersion = 0): string {
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${userId}.${sessionVersion}.${expiry}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Verify a signed session token. Returns { userId, sessionVersion } if
 * format+HMAC+expiry valid, null otherwise.
 *
 * Принимает как 4-частный новый формат (userId.version.expiry.hmac),
 * так и 3-частный legacy (userId.expiry.hmac — считаем version=0).
 */
export function verifySessionToken(token: string): VerifiedSession | null {
  const parts = token.split(".");

  if (parts.length === 4) {
    // Format v2: userId.sessionVersion.expiry.hmac
    const [userId, versionStr, expiryStr, signature] = parts;
    if (!userId || !versionStr || !expiryStr || !signature) return null;

    const sessionVersion = parseInt(versionStr, 10);
    if (!Number.isFinite(sessionVersion) || sessionVersion < 0) return null;

    const expiry = parseInt(expiryStr, 10);
    if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const payload = `${userId}.${versionStr}.${expiryStr}`;
    if (!verifySignature(payload, signature)) return null;

    return { userId, sessionVersion };
  }

  if (parts.length === 3) {
    // Format v1 (legacy): userId.expiry.hmac — признаём как version=0
    const [userId, expiryStr, signature] = parts;
    if (!userId || !expiryStr || !signature) return null;

    const expiry = parseInt(expiryStr, 10);
    if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const payload = `${userId}.${expiryStr}`;
    if (!verifySignature(payload, signature)) return null;

    return { userId, sessionVersion: 0 };
  }

  return null;
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildSessionCookie(token: string, isProduction: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(isProduction: boolean): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (name === COOKIE_NAME) {
      const value = valueParts.join("=");
      return value || null;
    }
  }
  return null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
