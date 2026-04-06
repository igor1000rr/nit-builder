/**
 * Session cookie management for NIT Builder v2.0
 *
 * Uses Appwrite session secret stored in an HttpOnly cookie.
 * Cookie is set server-side on register/login, cleared on logout.
 *
 * Security:
 * - HttpOnly: JavaScript can't read it (XSS protection)
 * - Secure: only sent over HTTPS in production
 * - SameSite=Lax: CSRF protection, still works on top-level navigation
 * - Path=/: sent on all routes
 * - Max-Age: 30 days (matches Appwrite default session TTL)
 */

const COOKIE_NAME = "nit_session" as const;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function buildSessionCookie(secret: string, isProduction: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${secret}`,
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
