import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { registerUser, createEmailSession } from "~/lib/server/appwrite.server";
import {
  buildSessionCookie,
  createSessionToken,
  isProduction,
} from "~/lib/server/sessionCookie.server";
import { checkRateLimit } from "~/lib/utils/rateLimit";

// ─── Validation ─────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email({ message: "Неверный формат email" }).max(255),
  password: z
    .string()
    .min(8, { message: "Минимум 8 символов" })
    .max(128, { message: "Максимум 128 символов" }),
  name: z.string().trim().max(100).optional(),
});

// ─── Action ───────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Rate limit by IP — spam / abuse protection. 5/мин достаточно для
  // легитимной регистрации и режет автоматические атаки которые могут
  // забить Appwrite мусорными юзерами.
  const rl = checkRateLimit(request, {
    scope: "register",
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rl.allowed) {
    return Response.json(
      {
        error: "Too many registration attempts. Try again in a minute.",
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

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;

  try {
    // 1. Create user + tunnel token
    const { userId, tunnelToken } = await registerUser({
      email,
      password,
      name,
    });

    // 2. Verify the password works by attempting login (Appwrite needs this
    //    to fully activate the user). We don't use the returned `secret` —
    //    Appwrite's server SDK doesn't populate it.
    await createEmailSession(email, password);

    // 3. Sign our own session token (HMAC over userId)
    const sessionToken = createSessionToken(userId);

    // 4. Return user info + tunnel token (shown ONCE) + session cookie
    return Response.json(
      {
        userId,
        email,
        tunnelToken, // Plaintext, shown to user once
        message:
          "Registration successful. Save your tunnel token — it will not be shown again.",
      },
      {
        status: 201,
        headers: {
          "Set-Cookie": buildSessionCookie(sessionToken, isProduction()),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    const msg = (err as Error).message;

    // Map common Appwrite errors to friendly messages
    if (msg.includes("already exists") || msg.includes("user_already_exists")) {
      return Response.json(
        { error: "Пользователь с таким email уже зарегистрирован" },
        { status: 409 },
      );
    }

    if (msg.includes("APPWRITE_API_KEY")) {
      return Response.json(
        { error: "Auth system is not configured. Contact admin." },
        { status: 503 },
      );
    }

    console.error("[api.auth.register] Failed:", msg);
    return Response.json(
      { error: "Registration failed. Try again later." },
      { status: 500 },
    );
  }
}
