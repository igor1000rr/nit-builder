import type {
  ImageProvider,
  ImageProviderContext,
  ImageProviderId,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../types";

import { UnsplashProvider } from "./unsplash";
import { StubProvider } from "./stub";
import { SdWebuiProvider } from "./sdWebui";

/**
 * Registry всех image-провайдеров + high-level generate() с fallback-chain.
 *
 * Убери UnsplashProvider из provider list если нужно 100% offline-режим.
 */

const DEFAULT_PROVIDERS: ImageProvider[] = [
  SdWebuiProvider, // приоритет если туннель есть
  UnsplashProvider, // fallback на сток
  StubProvider, // только в тестовом режиме
];

const registry = new Map<ImageProviderId, ImageProvider>();
for (const p of DEFAULT_PROVIDERS) registry.set(p.id, p);

export function registerImageProvider(provider: ImageProvider): void {
  registry.set(provider.id, provider);
}

export function getImageProvider(id: ImageProviderId): ImageProvider | undefined {
  return registry.get(id);
}

export function listImageProviders(): ImageProvider[] {
  return Array.from(registry.values());
}

export function _resetImageProvidersForTests(): void {
  registry.clear();
  for (const p of DEFAULT_PROVIDERS) registry.set(p.id, p);
}

/**
 * High-level facade. Пробует провайдеров в порядке:
 *   1. opts.preferredProviderId если указан и available
 *   2. Все остальные в порядке регистрации, взяв только available.
 *   3. Если провайдер вернул retryable failure — переходим к следующему.
 *   4. non-retryable (например invalid prompt) — возвращаем сразу.
 */
export async function generateImage(
  request: ImageGenerationRequest,
  opts: {
    ctx?: ImageProviderContext;
    preferredProviderId?: ImageProviderId;
    excludeProviders?: ImageProviderId[];
  } = {},
): Promise<ImageGenerationResult> {
  const ctx: ImageProviderContext = opts.ctx ?? {};
  const excluded = new Set(opts.excludeProviders ?? []);

  const tried: ImageGenerationResult[] = [];

  const ordered = listImageProviders().filter((p) => !excluded.has(p.id));
  if (opts.preferredProviderId) {
    const preferred = registry.get(opts.preferredProviderId);
    if (preferred && !excluded.has(preferred.id)) {
      ordered.sort((a, b) =>
        a.id === preferred.id ? -1 : b.id === preferred.id ? 1 : 0,
      );
    }
  }

  for (const provider of ordered) {
    const available = await provider.isAvailable(ctx);
    if (!available) continue;
    const result = await provider.generate(request, ctx);
    if (result.ok) return result;
    tried.push(result);
    if (!result.retryable) return result;
  }

  return {
    ok: false,
    providerId: "unsplash",
    error: `Ни один image-провайдер не вернул картинку (пробовали ${ordered.length}: ${tried.map((t) => !t.ok && `${t.providerId}=${t.error}`).filter(Boolean).join(", ")})`,
    retryable: false,
  };
}

export { UnsplashProvider, StubProvider, SdWebuiProvider };
export type {
  ImageProvider,
  ImageProviderContext,
  ImageProviderId,
  ImageGenerationRequest,
  ImageGenerationResult,
};
