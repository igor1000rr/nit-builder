import type {
  ImageProvider,
  ImageProviderContext,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../types";

/**
 * Stub провайдер — возвращает детерминистичный placeholder URL. Для тестов
 * и dev-среды когда не хочется ударять по сети.
 *
 * URL содержит размер + hash от prompt в пути — удобно снапшотить.
 */

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const StubProvider: ImageProvider = {
  id: "stub",
  name: "Stub (placeholder)",
  description:
    "Детерминистичный placeholder для тестов и dev-прогонов. Не делает сетевых запросов.",
  capabilities: {
    realGeneration: false,
    offline: true,
    requiresTunnel: false,
    requiresApiKey: false,
  },

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async generate(
    request: ImageGenerationRequest,
    _ctx: ImageProviderContext,
  ): Promise<ImageGenerationResult> {
    const ar = request.aspectRatio ?? "16:9";
    const hash = fnv1a(request.prompt);
    const url = `https://placehold.co/nit-stub/${ar.replace(":", "x")}/${hash}.png`;
    return {
      ok: true,
      url,
      providerId: "stub",
      seed: request.seed ?? 0,
      meta: { hash, aspectRatio: ar },
    };
  },
};
