/**
 * POST /api/auth/logout-all — инвалидирует ВСЕ session-токены текущего юзера.
 *
 * Механизм: bumpSessionVersion() инкрементирует nit_users.sessionVersion.
 * С этого момента getAuth будет отклонять все токены с меньшим version.
 *
 * Применение: кнопка "Выйти со всех устройств" в сеттингах, автоматически
 * при смене пароля, при подозрении на утечку cookie.
 *
 * Побочно: текущую cookie тоже очищаем (Set-Cookie: Max-Age=0) — юзер
 * увидит logged-out state даже без refresh.
 */

import type { ActionFunctionArgs } from "react-router";
import { getAuth } from "~/lib/server/requireAuth.server";
import { bumpSessionVersion } from "~/lib/server/appwrite.server";
import { buildClearCookie, isProduction } from "~/lib/server/sessionCookie.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Rate-limit: 3/мин. Не частотная операция, но каждый вызов пишет в Appwrite.
  const rl = checkRateLimit(request, {
    scope: "logout-all",
    windowMs: 60_000,
    maxRequests: 3,
  });
  if (!rl.allowed) {
    return Response.json(
      {
        error: "Too many logout-all requests. Try again in a minute.",
        retryAfterMs: rl.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)),
        },
      },
    );
  }

  const user = await getAuth(request);
  if (!user) {
    return Response.json({ error: "Unauthorized", code: "NO_SESSION" }, { status: 401 });
  }

  try {
    const newVersion = await bumpSessionVersion(user.userId);

    return Response.json(
      {
        success: true,
        sessionVersion: newVersion,
        message: "Все ваши сессии отозваны. Вы будете выкинуты со всех устройств.",
      },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildClearCookie(isProduction()),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[api.auth.logout-all] Failed:", (err as Error).message);
    return Response.json(
      { error: "Logout failed. Try again." },
      { status: 500 },
    );
  }
}
