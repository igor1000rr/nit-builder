import { z } from "zod";
import { checkAdminToken } from "~/lib/server/adminAuth";
import { addDocument, type RagCategory } from "~/lib/services/ragStore";

const CategoryEnum = z.enum([
  "plan_example",
  "hero_headline",
  "benefits",
  "social_proof",
  "cta_microcopy",
]);

const DocSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  text: z.string().min(2).max(4000),
  category: CategoryEnum,
  metadata: z.record(z.unknown()).optional(),
});

const BodySchema = z.object({
  documents: z.array(DocSchema).min(1).max(500),
});

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const raw = await request.json().catch(() => null);
  if (!raw) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    return Response.json({ error: detail }, { status: 400 });
  }

  let added = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of parsed.data.documents) {
    try {
      const result = await addDocument({
        id: doc.id,
        text: doc.text,
        category: doc.category as RagCategory,
        metadata: doc.metadata ?? {},
      });
      if (result) added++;
      else {
        failed++;
        errors.push(`${doc.id ?? "(auto)"}: addDocument returned null (RAG disabled?)`);
      }
    } catch (err) {
      failed++;
      errors.push(`${doc.id ?? "(auto)"}: ${(err as Error).message}`);
    }
  }

  return Response.json({
    added,
    failed,
    errors: errors.slice(0, 20),
  });
}
