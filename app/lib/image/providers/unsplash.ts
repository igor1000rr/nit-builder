import type {
  ImageProvider,
  ImageProviderContext,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../types";

/**
 * Unsplash провайдер — на самом деле это поиск-по-кейворду через Unsplash Source API.
 * Не генерация в буквальном смысле, но хороший fallback когда локальный
 * SD/Comfy недоступен. Именно этот механизм сейчас уже используется в генерируемых
 * шаблонах — переносим его в formal provider API чтобы одинаково дергать
 * вне зависимости от способа получения картинки.
 *
 * URL-формат: https://source.unsplash.com/featured/<W>x<H>/?<keyword>
 */

const ASPECT_SIZES: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "16:9": [1600, 900],
  "9:16": [900, 1600],
  "21:9": [1680, 720],
};

/**
 * Сжимает prompt в  1-3 ключевых слова для Unsplash. Unsplash не понимает
 * длинные prompt-фразы, только 1-3 keyword.
 */
function extractKeywords(prompt: string, niche?: string): string {
  if (niche) return niche.replace(/-/g, " ");
  // простая эвристика: первые 3 слова >3 символов
  const words = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  return words.join(" ") || "abstract";
}

export const UnsplashProvider: ImageProvider = {
  id: "unsplash",
  name: "Unsplash (stock)",
  description:
    "Поиск по стоку Unsplash по keyword. Всегда доступен (без API-key), но два сайта на одну нишу получат похожие картинки.",
  capabilities: {
    realGeneration: false,
    offline: false,
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
    const [w, h] = ASPECT_SIZES[ar] ?? ASPECT_SIZES["16:9"]!;
    const keyword = extractKeywords(request.prompt, request.niche);
    const url = `https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(keyword)}`;
    return {
      ok: true,
      url,
      providerId: "unsplash",
      meta: { width: w, height: h, keyword, aspectRatio: ar },
    };
  },
};
