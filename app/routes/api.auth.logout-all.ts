/**
 * POST /api/auth/logout-all — инвалидирует ВСЕ session-токены текущего юзера.
 *
 * Механизм: bumpSessionVersion() инкрементирует nit_users.sessionVersion.
 * С этого момента getAuth будет отклонять все токены с меньшим version.
 *
 * Дополнительно: revokeUserBrowsers закрывает все живые WS-сессии этого
 * юзера на текущем инстансе. Без этого старая WS осталась бы authed до
 * естественного реконнекта (heartbeat-revocation в wsHandlers тоже её
 * закроет, но через до 30s — manual close мгновенный).
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
import { revokeUserBrowsers } from "~/lib/services/tunnelRegistry.server";

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

    // Закрываем все живые WS-сессии этого юзера на текущем инстансе.
    // На других инстансах ревокация дойдёт через heartbeat (≤ 30s).
    const closedSessions = revokeUserBrowsers(
      user.userId,
      4001,
      "Session revoked via logout-all",
    );
    if (closedSessions > 0) {
      console.log(
        `[api.auth.logout-all] Closed ${closedSessions} active WS browser session(s) for user=${user.userId}`,
      );
    }

    return Response.json(
      {
        success: true,
        sessionVersion: newVersion,
        closedSessions,
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
