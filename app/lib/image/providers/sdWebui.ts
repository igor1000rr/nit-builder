import type {
  ImageProvider,
  ImageProviderContext,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../types";

/**
 * SD WebUI (Automatic1111) провайдер. Активен когда у юзера запущен
 * A1111 (или совместимый stable-diffusion-webui с --api) и Electron-туннель
 * пробрасывает порт 7860 в nit.vibecoding.by.
 *
 * Пока статус — stub с реальным контрактом API. Реальный fetch будет добавлен
 * когда туннельный протокол поддержит /sdapi/v1/txt2img proxy message
 * (новый message type image_request / image_chunk / image_end).
 *
 * Endpoint: POST {tunnelUrl}/sdapi/v1/txt2img
 * Body: { prompt, negative_prompt, width, height, seed, steps: 20, cfg_scale: 7 }
 * Response: { images: [base64_png] }
 */

const ASPECT_SIZES: Record<string, [number, number]> = {
  "1:1": [768, 768],
  "4:3": [896, 672],
  "3:4": [672, 896],
  "16:9": [1024, 576],
  "9:16": [576, 1024],
  "21:9": [1344, 576],
};

export const SdWebuiProvider: ImageProvider = {
  id: "sd-webui",
  name: "Stable Diffusion WebUI",
  description:
    "Automatic1111 WebUI через туннель юзера. Реальная генерация на GPU юзера, оффлайн и без cloud bills.",
  capabilities: {
    realGeneration: true,
    offline: true,
    requiresTunnel: true,
    requiresApiKey: false,
  },

  async isAvailable(ctx: ImageProviderContext): Promise<boolean> {
    if (!ctx.tunnelUrl) return false;
    // TODO: health-check когда туннельный протокол поддержит image_capabilities
    //       сейчас возвращаем false — не сломаем существующий pipeline
    return false;
  },

  async generate(
    request: ImageGenerationRequest,
    ctx: ImageProviderContext,
  ): Promise<ImageGenerationResult> {
    if (!ctx.tunnelUrl) {
      return {
        ok: false,
        providerId: "sd-webui",
        error: "sd-webui: туннель не подключён",
        retryable: true,
      };
    }

    // Scaffold: выводим параметры, возвращаем retryable failure.
    // Реальный fetch — в отдельном коммите вместе с расширением туннельного протокола.
    const ar = request.aspectRatio ?? "16:9";
    const [w, h] = ASPECT_SIZES[ar] ?? ASPECT_SIZES["16:9"]!;
    void w;
    void h;
    return {
      ok: false,
      providerId: "sd-webui",
      error: "sd-webui: имплементация ждёт расширения tunnel protocol (image_request/chunk/end)",
      retryable: true,
    };
  },
};
