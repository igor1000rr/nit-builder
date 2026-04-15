/**
 * Constrained decoding для Planner: прямой вызов LM Studio /v1/chat/completions
 * с response_format: {type: 'json_schema'} — 100% валидный PlanSchema JSON.
 *
 * Tier 2 шаг 5 (последний). Закрывает яму где generateObject на 7B моделях
 * иногда промахивается с типами и падает в fallback generateText. На наших 30
 * eval-queries это ~5-15% прогонов.
 *
 * Как работает:
 *   - LM Studio 0.3.10+ встроил XGrammar (Tianqi Chen, late 2024) — граммар-based
 *     constrained decoding. При response_format=json_schema модель НЕ может сэмплить
 *     токен который нарушит schema. Гарантия 100% структурной валидности.
 *   - По бенчмаркам XGrammar 2 (late 2025): оверхед < 5% от обычной генерации,
 *     иногда даже быстрее из-за более ранних stop conditions.
 *
 * Почему напрямую а не через AI SDK:
 *   - AI SDK прокидывает generateObject на mode='json' через prompt-engineering,
 *     не через native response_format. Для LM Studio json_schema нужен
 *     прямой OpenAI-compatible вызов.
 *   - Прямой fetch даёт контроль над всеми параметрами (timeout, signal, raw response).
 *
 * Graceful degradation:
 *   - Не LM Studio (cloud provider) → откат на generateObject без ENV-переменной
 *   - LM Studio < 0.3.10 → ответ 400, откат на generateObject
 *   - Любая другая ошибка → откат
 *   - ENV NIT_CONSTRAINED_DECODING_ENABLED=0 — жёсткий kill-switch
 */

import { logger } from "~/lib/utils/logger";
import { PlanSchema, type Plan } from "~/lib/utils/planSchema";
import { planJsonSchema } from "~/lib/utils/planJsonSchema";

const SCOPE = "constrainedPlanGen";
const LMSTUDIO_BASE = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

let runtimeDisabled = false;

export function isConstrainedDecodingEnabled(): boolean {
  if (process.env.NIT_CONSTRAINED_DECODING_ENABLED === "0") return false;
  return !runtimeDisabled;
}

export function resetConstrainedDecodingState(): void {
  runtimeDisabled = false;
}

function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", () => controller.abort(), { once: true });
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export type ConstrainedGenParams = {
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type ConstrainedGenResult =
  | { ok: true; plan: Plan; usage?: { prompt: number; completion: number } }
  | { ok: false; reason: string; transient: boolean };

/**
 * Генерирует Plan через LM Studio json_schema constrained decoding.
 * Возвращает ok:false с transient флагом для caller решения:
 *   - transient=true: разовый сбой (timeout, network), стоит fallback на generateObject
 *   - transient=false: provider не поддерживает (400, 404), отключаем на время сессии
 */
export async function generatePlanConstrained(
  params: ConstrainedGenParams,
): Promise<ConstrainedGenResult> {
  if (!isConstrainedDecodingEnabled()) {
    return { ok: false, reason: "disabled", transient: false };
  }

  try {
    const requestSignal = timeoutSignal(DEFAULT_TIMEOUT_MS, params.signal);
    const res = await fetch(`${LMSTUDIO_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.modelName,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        max_tokens: params.maxOutputTokens ?? 2500,
        temperature: params.temperature ?? 0.3,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "plan",
            strict: true,
            schema: planJsonSchema,
          },
        },
      }),
      signal: requestSignal,
    });

    if (!res.ok) {
      // 400/404/501 — provider не поддерживает json_schema. Отключаем на сессию.
      if (res.status === 400 || res.status === 404 || res.status === 501) {
        runtimeDisabled = true;
        logger.warn(
          SCOPE,
          `Provider doesn't support json_schema (HTTP ${res.status}), disabling for session`,
        );
        return { ok: false, reason: `http_${res.status}_unsupported`, transient: false };
      }
      return { ok: false, reason: `http_${res.status}`, transient: true };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, reason: "empty_response", transient: true };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, reason: "invalid_json", transient: true };
    }

    const validation = PlanSchema.safeParse(parsed);
    if (!validation.success) {
      // С constrained decoding это не должно происходить в норме
      // (разве что schema и zod-проверка расходятся). Для оптимизации — fallback.
      logger.warn(
        SCOPE,
        `Constrained output failed Zod validation: ${validation.error.errors[0]?.message}`,
      );
      return { ok: false, reason: "zod_mismatch", transient: true };
    }

    const usage = data.usage
      ? {
          prompt: data.usage.prompt_tokens ?? 0,
          completion: data.usage.completion_tokens ?? 0,
        }
      : undefined;

    return { ok: true, plan: validation.data, usage };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      const isUserAbort = params.signal?.aborted ?? false;
      if (isUserAbort) throw err;
      return { ok: false, reason: "timeout", transient: true };
    }
    return { ok: false, reason: (err as Error).message, transient: true };
  }
}
