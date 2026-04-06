import { TEMPLATE_CATALOG } from "~/lib/config/htmlTemplatesCatalog";
import { getStats } from "~/lib/services/tunnelRegistry.server";
import { isAppwriteConfigured } from "~/lib/server/appwrite.server";

export async function loader() {
  const stats = getStats();
  return Response.json({
    status: "ok",
    version: "2.0.0-alpha.0",
    mode: process.env.NODE_ENV ?? "production",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    appwrite: {
      configured: isAppwriteConfigured(),
      endpoint: process.env.APPWRITE_ENDPOINT ?? null,
    },
    tunnels: {
      uniqueUsersWithTunnel: stats.uniqueUsersWithTunnel,
      activeTunnels: stats.activeTunnels,
      activeBrowsers: stats.activeBrowsers,
      pendingRequests: stats.pendingRequests,
      totalTunnelsRegistered: stats.totalTunnelsRegistered,
      totalRequestsRouted: stats.totalRequestsRouted,
      totalRequestsCompleted: stats.totalRequestsCompleted,
      totalRequestsFailed: stats.totalRequestsFailed,
    },
    templates: TEMPLATE_CATALOG.length,
  });
}
