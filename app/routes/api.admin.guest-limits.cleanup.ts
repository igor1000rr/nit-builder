import { checkAdminToken } from "~/lib/server/adminAuth";
import {
  cleanupExpiredGuestLimits,
  isAppwriteConfigured,
} from "~/lib/server/appwrite.server";
import { logger } from "~/lib/utils/logger";

/**
 * Admin endpoint: cleanup устаревших nit_guest_limits записей.
 *
 * Без этого коллекция растёт бесконечно — по одной записи на каждый
 * уникальный IP-хэш который когда-либо посещал сайт. При 1k гостей/день это
 * ~365k записей/год, в основном с protухшим resetAt.
 *
 * Рекомендуется вешать на cron 1 раз в сутки:
 *   curl -X POST -H "Authorization: Bearer $NIT_ADMIN_TOKEN" \
 *        https://nit-builder.com/api/admin/guest-limits/cleanup
 *
 * Idempotent: повторный вызов безопасен, при пустой очереди возвращает deleted=0.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return new Response(auth.error, { status: auth.status });
  }

  if (!isAppwriteConfigured()) {
    return Response.json(
      { error: "Appwrite не настроен, гостевые лимиты хранятся in-memory — cleanup не нужен" },
      { status: 503 },
    );
  }

  try {
    const summary = await cleanupExpiredGuestLimits();
    logger.info(
      "admin.guest-limits.cleanup",
      `scanned=${summary.scanned} deleted=${summary.deleted} batches=${summary.batches}`,
    );
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cleanup failed";
    logger.error("admin.guest-limits.cleanup", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
