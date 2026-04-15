import { z } from "zod";
import { checkAdminToken } from "~/lib/server/adminAuth";
import { runEvalSuite } from "~/lib/eval/runner";

const BodySchema = z
  .object({
    maxQueries: z.number().int().min(1).max(100).optional(),
    disableRag: z.boolean().optional(),
    disableReasoning: z.boolean().optional(),
    providerOverride: z
      .object({ modelName: z.string().min(1).optional() })
      .optional(),
  })
  .strict();

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") },
      { status: 400 },
    );
  }

  // AbortController для остановки по close клиента
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  try {
    const report = await runEvalSuite({
      ...parsed.data,
      signal: controller.signal,
    });
    return Response.json(report);
  } catch (err) {
    if ((err as Error).name === "AbortError" || (err as Error).message === "AbortError") {
      return Response.json({ error: "Aborted" }, { status: 499 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
