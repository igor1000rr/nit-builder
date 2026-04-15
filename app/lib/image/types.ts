/**
 * Image generation — pluggable provider interface.
 *
 * Мотивация: сейчас hero-картинки в генерируемых лендингах берутся из
 * Unsplash по keyword search. Это работает, но не даёт уникальности — два
 * сайта на одну и ту же нишу получают одни и те же сток-фотки. Roadmap задача
 * v1.3: image gen через Stable Diffusion локально (в духе "свой GPU, свой inference").
 *
 * Архитектура: провайдеры как плагины. Туннель должен объявлять что у него
 * есть image endpoint (SD WebUI, ComfyUI, A1111) через capability flag, и сервер
 * выбирает соответствующего провайдера. Если ничего нет — fallback на Unsplash
 * провайдер (который возвращает URL картинки вместо генерации).
 *
 * API:
 *   interface ImageProvider {
 *     id: ImageProviderId;
 *     name: string;
 *     isAvailable(ctx): Promise<boolean>;
 *     generate(req, ctx): Promise<ImageGenerationResult>;
 *   }
 *
 *   registerImageProvider(provider)
 *   getImageProvider(id) | getDefaultImageProvider()
 *   generateImage(request, opts?) — high-level facade
 */

export type ImageProviderId =
  | "unsplash"       // fallback — URL картинки из Unsplash Source
  | "stub"           // no-op, всегда возвращает placeholder URL
  | "sd-webui"       // Automatic1111 HTTP API (через туннель к juzer local)
  | "comfy"          // ComfyUI workflow API
  | "lm-studio-sdxl" // LM Studio когда поддержит SDXL (пока не поддерживает, но API готов)
  | "replicate"      // Replicate cloud fallback (если ничего локально нет)
  | string;          // открыт для custom registration

export type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";

export type ImageGenerationRequest = {
  /** Основное описание для генерации/поиска. */
  prompt: string;

  /** Что ИСКЛЮЧИТЬ из генерации (SD и Comfy понимают напрямую, сток-провайдеры игнорируют). */
  negativePrompt?: string;

  /** Важно для hero vs og:image vs thumbnail. Default "16:9". */
  aspectRatio?: AspectRatio;

  /**
   * Seed для детерминистичности при тестах и для "регенерации похожего".
   * Игнорируется stub и unsplash провайдерами.
   */
  seed?: number;

  /** Контекст плана для адаптации (ниша, mood) — провайдеры могут игнорировать. */
  niche?: string;
  colorMood?: string;
};

export type ImageGenerationSuccess = {
  ok: true;
  /** URL готовой картинки. Может быть http(s):// или data:image/...;base64,... */
  url: string;
  /** Каким провайдером сгенерировано (для дебага/аналитики). */
  providerId: ImageProviderId;
  /** Seed который фактически использовался. */
  seed?: number;
  /** Произвольные мета-данные (width/height/latency/etc). */
  meta?: Record<string, unknown>;
};

export type ImageGenerationFailure = {
  ok: false;
  providerId: ImageProviderId;
  error: string;
  /** true если имеет смысл попробовать другого провайдера (fallback chain). */
  retryable: boolean;
};

export type ImageGenerationResult = ImageGenerationSuccess | ImageGenerationFailure;

/** Контекст передаваемый в провайдер при generate/isAvailable. */
export type ImageProviderContext = {
  /** Ссылка на туннель юзера (если есть) — нужна для sd-webui / comfy провайдеров. */
  tunnelUrl?: string;
  /** API key для cloud провайдеров (Replicate). */
  apiKey?: string;
  signal?: AbortSignal;
};

export type ImageProvider = {
  id: ImageProviderId;
  name: string;
  /** User-facing описание. */
  description: string;
  /**
   * Capability flags — сервер использует для выбора провайдера под задачу.
   *   realGeneration: true означает что провайдер действительно генерирует
   *   (vs поиск-по-стоку). Влияет на выбор когда у юзера есть туннель.
   */
  capabilities: {
    realGeneration: boolean;
    offline: boolean;
    requiresTunnel: boolean;
    requiresApiKey: boolean;
  };
  /**
   * Проверяет что провайдер сейчас может работать. Например
   * sd-webui доступен только при наличии tunnelUrl + health-check от webui.
   */
  isAvailable(ctx: ImageProviderContext): Promise<boolean>;
  /** Генерация или поиск картинки. */
  generate(
    request: ImageGenerationRequest,
    ctx: ImageProviderContext,
  ): Promise<ImageGenerationResult>;
};
