import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { createEmailSession } from "~/lib/server/appwrite.server";
import { buildSessionCookie, isProduction } from "~/lib/server/sessionCookie.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";

// ─── Validation ──────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

// ─── Action ──────────────────────────────────────────────────────

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
    const { secret, userId } = await createEmailSession(email, password);

    return Response.json(
      { userId, email },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionCookie(secret, isProduction()),
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
