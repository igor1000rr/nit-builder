/**
 * Проверка admin-токена для служебных /api/admin/* эндпоинтов.
 *
 * Требует env NIT_ADMIN_TOKEN. Запрос должен прислать его в одном из:
 * - заголовке x-nit-admin-token: <token>
 * - заголовке Authorization: Bearer <token>
 *
 * Если env не выставлен — эндпоинты отвечают 503 (фейлсейф на случай забытого
 * env). Это намеренно — лучше отказать чем отдать корпус feedback или метрики
 * без защиты.
 */

export type AdminCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function checkAdminToken(request: Request): AdminCheckResult {
  const expected = process.env.NIT_ADMIN_TOKEN;
  if (!expected || expected.length < 8) {
    return {
      ok: false,
      status: 503,
      error: "Admin endpoints disabled. Set NIT_ADMIN_TOKEN (min 8 chars) in env.",
    };
  }

  const headerToken =
    request.headers.get("x-nit-admin-token") ??
    (() => {
      const auth = request.headers.get("authorization") ?? "";
      const m = auth.match(/^Bearer\s+(.+)$/i);
      return m ? m[1] : null;
    })();

  if (!headerToken) {
    return { ok: false, status: 401, error: "Missing admin token" };
  }
  if (!timingSafeEqual(headerToken, expected)) {
    return { ok: false, status: 401, error: "Invalid admin token" };
  }
  return { ok: true };
}

/** Constant-time сравнение строк одинаковой длины — против timing attack. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
