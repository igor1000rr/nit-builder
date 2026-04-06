/**
 * Authentication middleware helper.
 *
 * Uses signed session tokens (HMAC) instead of Appwrite session secrets.
 * See sessionCookie.server.ts for the rationale (server SDK doesn't return
 * session secrets, so we sign our own).
 *
 * Usage in loaders/actions:
 *   const user = await requireAuth(request);
 *   // ... use user.userId, user.email
 *
 * If no valid session, throws a Response with 401 (caught by React Router).
 */

import { parseSessionCookie, verifySessionToken } from "./sessionCookie.server";
import { getUserById } from "./appwrite.server";

export type AuthenticatedUser = {
  userId: string;
  email: string;
};

/**
 * Extract the current user from the request's session cookie.
 * Returns null if not authenticated.
 *
 * Steps:
 * 1. Parse cookie header for nit_session
 * 2. Verify HMAC signature + check not expired (cheap, no network)
 * 3. Look up user details by userId in Appwrite (one network call)
 *
 * If you need to call this multiple times in one request, cache the
 * result yourself — we don't memoize across calls.
 */
export async function getAuth(request: Request): Promise<AuthenticatedUser | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = parseSessionCookie(cookieHeader);
  if (!token) return null;

  const userId = verifySessionToken(token);
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  return user;
}

/**
 * Like getAuth, but throws 401 if not authenticated.
 * Use in protected routes/endpoints.
 */
export async function requireAuth(request: Request): Promise<AuthenticatedUser> {
  const user = await getAuth(request);
  if (!user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized", code: "NO_SESSION" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return user;
}
