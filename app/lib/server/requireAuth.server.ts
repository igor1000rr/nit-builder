/**
 * Authentication middleware helper.
 *
 * Uses signed session tokens (HMAC) с session-version revocation.
 * См. sessionCookie.server.ts для деталей формата токена и revocation.
 *
 * Usage in loaders/actions:
 *   const user = await requireAuth(request);
 *   // ... use user.userId, user.email
 *
 * If no valid session, throws a Response with 401 (caught by React Router).
 */

import { parseSessionCookie, verifySessionToken } from "./sessionCookie.server";
import { getUserById, getUserSessionVersion } from "./appwrite.server";

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
 * 4. Compare token sessionVersion с current user sessionVersion — если
 *    version в токене меньше чем текущая в БД, токен отозван (logout-all).
 *
 * Для legacy юзеров без nit_users документа или без sessionVersion поля,
 * current version считаем 0 — legacy-токены (v1, без version в payload)
 * проходят как version=0 и совпадают.
 *
 * If you need to call this multiple times in one request, cache the
 * result yourself — we don't memoize across calls.
 */
export async function getAuth(request: Request): Promise<AuthenticatedUser | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = parseSessionCookie(cookieHeader);
  if (!token) return null;

  const verified = verifySessionToken(token);
  if (!verified) return null;

  // Два round-trip'а к Appwrite: один за email (admin Users API),
  // второй за sessionVersion (nit_users Databases API). Не объединимы
  // в один запрос потому что email в Appwrite accounts, а nit_users —
  // наш кастомный document store. В будущем можно закэшировать
  // sessionVersion на 30 секунд in-memory если нагрузка вырастет.
  const [user, currentVersion] = await Promise.all([
    getUserById(verified.userId),
    getUserSessionVersion(verified.userId),
  ]);
  if (!user) return null;

  if (verified.sessionVersion < currentVersion) {
    // Токен из допредыдущей эпохи — отозван через logout-all или password change.
    return null;
  }

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
