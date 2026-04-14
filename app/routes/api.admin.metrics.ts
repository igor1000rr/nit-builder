import { checkAdminToken } from "~/lib/server/adminAuth";
import { exportMetrics } from "~/lib/services/metrics";

/**
 * Prometheus text-format экспозитор. Пригоден для scraping через Prometheus
 * server или Grafana Agent. Защищён админ-токеном чтобы не светить в
 * открытом доступе статистику по template_id / section которая косвенно
 * даёт сигнал о пользовательском паттерне.
 */
export async function loader({ request }: { request: Request }) {
  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return new Response(auth.error, { status: auth.status });
  }

  return new Response(exportMetrics(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
