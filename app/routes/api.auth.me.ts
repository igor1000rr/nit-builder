import type { LoaderFunctionArgs } from "react-router";
import { getAuth } from "~/lib/server/requireAuth.server";
import { getNitUser } from "~/lib/server/appwrite.server";
import { hasTunnelForUser, getTunnelCount } from "~/lib/services/tunnelRegistry.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuth(request);
  if (!user) {
    return Response.json({ authenticated: false }, { status: 200 });
  }

  const nitUser = await getNitUser(user.userId);

  return Response.json({
    authenticated: true,
    userId: user.userId,
    email: user.email,
    preferredProvider: nitUser?.preferredProvider ?? "tunnel",
    tunnelTokenCreatedAt: nitUser?.tunnelTokenCreatedAt ?? null,
    tunnel: {
      status: hasTunnelForUser(user.userId) ? "online" : "offline",
      activeTunnels: getTunnelCount(user.userId),
    },
  });
}
