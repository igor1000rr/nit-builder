import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/server/requireAuth.server";
import { listUserSites, saveSite } from "~/lib/server/appwrite.server";

// ─── GET /api/sites — list current user's sites ──────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);

  try {
    const sites = await listUserSites(user.userId, 50);
    return Response.json({
      sites: sites.map((s) => ({
        id: s.$id,
        createdAt: s.$createdAt,
        updatedAt: s.$updatedAt,
        prompt: s.prompt,
        templateId: s.templateId,
        templateName: s.templateName,
        thumbnail: s.thumbnail ?? null,
        // html is NOT included in the list view — fetch individually via /api/sites/:id
      })),
    });
  } catch (err) {
    console.error("[api.sites] list failed:", err);
    return Response.json({ error: "Failed to list sites" }, { status: 500 });
  }
}

// ─── POST /api/sites — save a new site ───────────────────────────

const SaveSiteSchema = z.object({
  prompt: z.string().min(1).max(5000),
  html: z.string().min(1).max(1_000_000),
  templateId: z.string().min(1).max(64),
  templateName: z.string().min(1).max(128),
  thumbnail: z.string().max(100_000).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireAuth(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveSiteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const id = await saveSite({
      userId: user.userId,
      ...parsed.data,
    });
    return Response.json({ id, message: "Site saved" }, { status: 201 });
  } catch (err) {
    console.error("[api.sites] save failed:", err);
    return Response.json({ error: "Failed to save site" }, { status: 500 });
  }
}
