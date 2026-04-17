import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/server/requireAuth.server";
import {
  regenerateTunnelToken,
  createEmailSession,
} from "~/lib/server/appwrite.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";

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

  // Verify password by attempting to create a new session
  try {
    await createEmailSession(user.email, parsed.data.password);
  } catch {
    return Response.json({ error: "Неверный пароль" }, { status: 401 });
  }

  // Regenerate token
  try {
    const newToken = await regenerateTunnelToken(user.userId);
    return Response.json({
      tunnelToken: newToken,
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
