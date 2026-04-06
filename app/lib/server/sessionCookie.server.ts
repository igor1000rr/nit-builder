/**
 * Session cookie — signed stateless tokens.
 *
 * The cookie value is `userId.expiryUnix.hmacSignature`. On every request we
 * parse the three parts, recompute the HMAC, and check it matches. If yes,
 * the cookie is valid and we trust the userId. If no (or expired), the
 * session is rejected.
 *
 * Why not use Appwrite session secrets directly?
 * Appwrite's server SDK (`account.createEmailPasswordSession`) returns a
 * Session object whose `secret` field is always empty when called without
 * a client-side cookie context — secrets are only delivered via the
 * Set-Cookie response in browser flows. Since we're a server-rendered app
 * proxying through Appwrite, we sign our own tokens instead and treat
 * Appwrite as a credentials store.
 *
 * Security:
 * - HMAC-SHA256 with NIT_TOKEN_LOOKUP_SECRET
 *   (same env var used by tunnelTokens — it's cryptographic key material)
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

/**
 * Create a signed session token for the given user.
 * Format: `userId.expiryUnixSec.hmacHex`
 */
export function createSessionToken(userId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${userId}.${expiry}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Verify a signed session token. Returns userId if valid, null otherwise.
 */
export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryStr, signature] = parts;
  if (!userId || !expiryStr || !signature) return null;

  // Check expiry first (cheap)
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) {
    return null;
  }

  // Recompute signature, compare in constant time
  const payload = `${userId}.${expiryStr}`;
  const expected = sign(payload);
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return userId;
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
