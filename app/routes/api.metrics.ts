import { exportMetrics } from "~/lib/services/metrics";

export function loader() {
  return new Response(exportMetrics(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
