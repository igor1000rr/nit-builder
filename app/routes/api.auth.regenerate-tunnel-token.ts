import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/server/requireAuth.server";
import {
  regenerateTunnelToken,
  createEmailSession,
  deleteSession,
} from "~/lib/server/appwrite.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";
import { revokeUserTunnels } from "~/lib/services/tunnelRegistry.server";

// ─── Validation ─────────────────────────────────────────────────────
// Require password re-entry for sensitive operation (regenerating token
// invalidates all existing tunnel clients, so we want to confirm identity)

const RegenerateSchema = z.object({
  password: z.string().min(1).max(128),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireAuth(request);

  // Rate limit по userId — защита от брутфорса пароля через этот эндпоинт.
  // Регенерация редкая операция (раз в пару месяцев), 5/мин — более чем
  // достаточно для легитимного использования.
  const rl = checkRateLimit(request, {
    scope: `regenerate-token:${user.userId}`,
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rl.allowed) {
    return Response.json(
      {
        error: "Too many attempts. Try again in a minute.",
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegenerateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Password required" }, { status: 400 });
  }

  // Verify password by attempting to create a new session, then delete it.
  // Без cleanup каждый regenerate-вызов копит мёртвую Appwrite-сессию у юзера —
  // тот же баг что был в /api/auth/login (CHANGELOG fix a3f225e), здесь
  // повторился. Fire-and-forget delete: ошибка cleanup не должна ломать flow.
  try {
    const { secret } = await createEmailSession(user.email, parsed.data.password);
    void deleteSession(secret).catch((err: Error) => {
      console.warn(
        "[api.auth.regenerate-tunnel-token] Failed to clean up Appwrite session:",
        err.message,
      );
    });
  } catch {
    return Response.json({ error: "Неверный пароль" }, { status: 401 });
  }

  // Regenerate token
  try {
    const newToken = await regenerateTunnelToken(user.userId);

    // Принудительно закрываем все живые туннели юзера. Без этого старый
    // tunnel-клиент остаётся подключённым с уже верифицированным токеном —
    // argon2 verify происходит только на hello, а WS живёт до естественного
    // close. На других инстансах туннель рано или поздно реконнектится и
    // отвалится с INVALID_TOKEN, но manual close мгновенно прекращает приём
    // generate-запросов на этом сервере.
    const closedTunnels = revokeUserTunnels(
      user.userId,
      4001,
      "Tunnel token regenerated",
    );
    if (closedTunnels > 0) {
      console.log(
        `[api.auth.regenerate-tunnel-token] Closed ${closedTunnels} active tunnel(s) for user=${user.userId}`,
      );
    }

    return Response.json({
      tunnelToken: newToken,
      closedTunnels,
      message:
        "New tunnel token generated. Save it now — the old token has been revoked.",
    });
  } catch (err) {
    console.error("[api.auth.regenerate-tunnel-token] Failed:", err);
    return Response.json(
      { error: "Failed to regenerate token" },
      { status: 500 },
    );
  }
}
