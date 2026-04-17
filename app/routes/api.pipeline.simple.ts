import { z } from "zod";
import { authOrGuest, checkGuestLimit } from "~/lib/server/auth";
import { checkRateLimit } from "~/lib/utils/rateLimit";
import { getOrCreateSession } from "~/lib/services/sessionMemory";
import {
  executeHtmlSimple,
  executeHtmlPolish,
  executeHtmlContinue,
} from "~/lib/services/htmlOrchestrator";

const Schema = z
  .object({
    mode: z.enum(["create", "polish", "continue"]).default("create"),
    projectId: z.string().min(1),
    sessionId: z.string().optional(),
    message: z.string().max(10_000).optional(),
    providerId: z.string().optional(),
    modelName: z.string().optional(),
    polishIntent: z.enum(["css_patch", "full_rewrite"]).optional(),
    targetSection: z.string().min(1).max(50).optional(),
  })
  .refine(
    (d) => d.mode === "continue" || (typeof d.message === "string" && d.message.length >= 1),
    { message: "message required for mode=create|polish" },
  )
  .refine(
    (d) => d.mode !== "continue" || typeof d.sessionId === "string",
    { message: "sessionId required for mode=continue" },
  );

function sse(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function startPing(controller: ReadableStreamDefaultController, enc: TextEncoder) {
  return setInterval(() => {
    try { controller.enqueue(enc.encode(":ping\n\n")); } catch {}
  }, 15_000);
}

export async function action({ request }: { request: Request }) {
  const { isGuest, csrfError } = await authOrGuest(request);
  if (csrfError) return csrfError;

  if (isGuest) {
    const g = await checkGuestLimit(request);
    if (!g.allowed) {
      return Response.json(
        { error: "Дневной лимит исчерпан. Попробуй завтра или задай NIT_API_SECRET.", code: "GUEST_LIMIT" },
        { status: 429 },
      );
    }
  }

  // Rate limit: 5 rpm для гостей, 30 rpm для залогиненных. Раньше все шли
  // как гости (authOrGuest был sync и не знал про Appwrite) — залогиненные
  // упирались в 5 rpm при HTTP fallback когда их туннель был offline.
  const rate = checkRateLimit(request, {
    maxRequests: isGuest ? 5 : 30,
    windowMs: 60_000,
    scope: "simple",
  });
  if (!rate.allowed) {
    const retry = rate.retryAfterMs ? Math.ceil(rate.retryAfterMs / 1000) : 60;
    return Response.json({ error: "Too many requests", retryAfter: retry }, {
      status: 429,
      headers: { "Retry-After": String(retry) },
    });
  }

  const raw = await request.json().catch(() => null);
  if (!raw) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return Response.json({ error: detail }, { status: 400 });
  }

  const { mode, projectId, message, providerId, modelName, polishIntent, targetSection } = parsed.data;
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const memory = getOrCreateSession(sessionId, projectId);
  const providerOverride = providerId ? { providerId, modelName } : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const ping = startPing(controller, encoder);
      try {
        controller.enqueue(encoder.encode(sse({ type: "session_init", sessionId })));

        const gen =
          mode === "polish"
            ? executeHtmlPolish(memory, message!, request.signal, {
                providerOverride,
                polishIntent,
                targetSection,
              })
            : mode === "continue"
            ? executeHtmlContinue(memory, request.signal, { providerOverride })
            : executeHtmlSimple(memory, message!, request.signal, { providerOverride });

        for await (const event of gen) {
          controller.enqueue(encoder.encode(sse(event)));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if ((err as Error).name === "AbortError") { controller.close(); return; }
        const msg = err instanceof Error ? err.message : "Pipeline error";
        controller.enqueue(encoder.encode(sse({ type: "error", message: msg })));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } finally {
        clearInterval(ping);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
