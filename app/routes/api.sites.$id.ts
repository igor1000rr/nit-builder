import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/server/requireAuth.server";
import {
  APPWRITE_CONFIG,
  deleteSite,
  getAdminDatabases,
  type NitSite,
} from "~/lib/server/appwrite.server";

// ─── GET /api/sites/:id — get one site (with full HTML) ──────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  const siteId = params.id;
  if (!siteId) {
    return Response.json({ error: "Site ID required" }, { status: 400 });
  }

  try {
    const db = getAdminDatabases();
    const site = await db.getDocument<NitSite>(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.sites,
      siteId,
    );

    // Ownership check
    if (site.userId !== user.userId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({
      id: site.$id,
      createdAt: site.$createdAt,
      updatedAt: site.$updatedAt,
      prompt: site.prompt,
      html: site.html,
      templateId: site.templateId,
      templateName: site.templateName,
      thumbnail: site.thumbnail ?? null,
    });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

// ─── DELETE /api/sites/:id ───────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireAuth(request);
  const siteId = params.id;
  if (!siteId) {
    return Response.json({ error: "Site ID required" }, { status: 400 });
  }

  const ok = await deleteSite(user.userId, siteId);
  if (!ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ message: "Site deleted" });
}
