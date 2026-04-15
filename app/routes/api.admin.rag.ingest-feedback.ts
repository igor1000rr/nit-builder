import { z } from "zod";
import { checkAdminToken } from "~/lib/server/adminAuth";
import { runFeedbackIngest } from "~/lib/services/feedbackIngest";

const BodySchema = z
  .object({
    limit: z.number().int().min(1).max(5000).optional(),
    dryRun: z.boolean().optional(),
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
      {
        error: parsed.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  try {
    const summary = await runFeedbackIngest({
      ...parsed.data,
      signal: controller.signal,
    });
    return Response.json(summary);
  } catch (err) {
    if ((err as Error).name === "AbortError" || (err as Error).message === "AbortError") {
      return Response.json({ error: "Aborted" }, { status: 499 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
