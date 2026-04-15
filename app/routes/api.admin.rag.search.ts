import { checkAdminToken } from "~/lib/server/adminAuth";
import { search, type RagCategory } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";

const VALID_CATEGORIES: RagCategory[] = [
  "plan_example",
  "hero_headline",
  "benefits",
  "social_proof",
  "cta_microcopy",
];

export async function loader({ request }: { request: Request }) {
  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) {
    return Response.json({ error: "Missing q= parameter" }, { status: 400 });
  }

  const categoryRaw = url.searchParams.get("category");
  const category = (VALID_CATEGORIES as string[]).includes(categoryRaw ?? "")
    ? (categoryRaw as RagCategory)
    : undefined;

  const k = Math.min(Math.max(parseInt(url.searchParams.get("k") ?? "5", 10) || 5, 1), 20);

  try {
    await ensureSeeded();
    const results = await search(query, { k, category });
    return Response.json({
      query,
      category: category ?? "all",
      k,
      results: results.map((r) => ({
        id: r.doc.id,
        score: Number(r.score.toFixed(4)),
        category: r.doc.category,
        text: r.doc.text,
        metadata: r.doc.metadata,
      })),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
