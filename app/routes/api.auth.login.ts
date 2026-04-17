import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import {
  createEmailSession,
  deleteSession,
  getUserSessionVersion,
} from "~/lib/server/appwrite.server";
import {
  buildSessionCookie,
  createSessionToken,
  isProduction,
} from "~/lib/server/sessionCookie.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";

// ─── Validation ─────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

// ─── Action ────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Rate limit by IP — brute force protection
  const rl = checkRateLimit(request, {
    scope: "login",
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!rl.allowed) {
    return Response.json(
      {
        error: "Too many login attempts. Try again in a minute.",
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

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  try {
    // createEmailSession создаёт Appwrite session чтобы проверить пароль.
    // Мы её не используем (своя cookie + JWT), поэтому удаляем сразу после
    // verify — иначе у юзера копятся мёртвые сессии в Appwrite (по одной
    // на каждый login). Cleanup fire-and-forget.
    const { userId, secret } = await createEmailSession(email, password);
    void deleteSession(secret).catch((err: Error) => {
      console.warn("[api.auth.login] Failed to clean up Appwrite session:", err.message);
    });

    // Читаем current sessionVersion чтобы embed'нуть её в токен.
    // Без этого после logout-all свежий login сразу был бы отозван (version=0
    // в новом токене < уже бампнутой current).
    const sessionVersion = await getUserSessionVersion(userId);
    const sessionToken = createSessionToken(userId, sessionVersion);

    return Response.json(
      { userId, email },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionCookie(sessionToken, isProduction()),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "INVALID_CREDENTIALS" || msg.includes("invalid")) {
      return Response.json(
        { error: "Неверный email или пароль" },
        { status: 401 },
      );
    }

    if (msg.includes("APPWRITE_API_KEY")) {
      return Response.json(
        { error: "Auth system is not configured." },
        { status: 503 },
      );
    }

    console.error("[api.auth.login] Failed:", msg);
    return Response.json(
      { error: "Login failed. Try again." },
      { status: 500 },
    );
  }
}
