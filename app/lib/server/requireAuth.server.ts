/**
 * Authentication middleware helper.
 *
 * Usage in loaders/actions:
 *   const user = await requireAuth(request);
 *   // ... use user.userId, user.email
 *
 * If no valid session, throws a Response with 401 (caught by React Router).
 */

import { parseSessionCookie } from "./sessionCookie.server";
import { getUserBySessionSecret } from "./appwrite.server";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  sessionSecret: string;
};

/**
 * Extract the current user from the request's session cookie.
 * Returns null if not authenticated.
 */
export async function getAuth(request: Request): Promise<AuthenticatedUser | null> {
  const cookieHeader = request.headers.get("Cookie");
  const secret = parseSessionCookie(cookieHeader);
  if (!secret) return null;

  const user = await getUserBySessionSecret(secret);
  if (!user) return null;

  return { ...user, sessionSecret: secret };
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
