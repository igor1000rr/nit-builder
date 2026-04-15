import { describe, it, expect, beforeEach } from "vitest";
import {
  StubProvider,
  UnsplashProvider,
  SdWebuiProvider,
  generateImage,
  listImageProviders,
  registerImageProvider,
  getImageProvider,
  _resetImageProvidersForTests,
} from "~/lib/image/providers";
import type { ImageProvider, ImageGenerationResult } from "~/lib/image/types";

beforeEach(() => {
  _resetImageProvidersForTests();
});

describe("image providers registry", () => {
  it("содержит default провайдеров", () => {
    const providers = listImageProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("sd-webui");
    expect(ids).toContain("unsplash");
    expect(ids).toContain("stub");
  });

  it("getImageProvider по id", () => {
    expect(getImageProvider("stub")?.name).toContain("Stub");
    expect(getImageProvider("unsplash")?.name).toContain("Unsplash");
    expect(getImageProvider("unknown" as never)).toBeUndefined();
  });

  it("registerImageProvider добавляет кастомный", () => {
    const custom: ImageProvider = {
      id: "custom-test" as never,
      name: "Custom",
      description: "test",
      capabilities: {
        realGeneration: false,
        offline: true,
        requiresTunnel: false,
        requiresApiKey: false,
      },
      isAvailable: async () => true,
      generate: async () => ({
        ok: true,
        url: "test://custom",
        providerId: "custom-test" as never,
      }),
    };
    registerImageProvider(custom);
    expect(getImageProvider("custom-test" as never)).toBe(custom);
  });
});

describe("StubProvider", () => {
  it("всегда isAvailable", async () => {
    expect(await StubProvider.isAvailable({})).toBe(true);
  });

  it("возвращает детерминистичный URL", async () => {
    const r1 = await StubProvider.generate({ prompt: "coffee shop hero" }, {});
    const r2 = await StubProvider.generate({ prompt: "coffee shop hero" }, {});
    if (r1.ok && r2.ok) {
      expect(r1.url).toBe(r2.url);
    } else {
      throw new Error("expected ok");
    }
  });

  it("разные промпты дают разные URL", async () => {
    const r1 = await StubProvider.generate({ prompt: "A" }, {});
    const r2 = await StubProvider.generate({ prompt: "B" }, {});
    if (r1.ok && r2.ok) expect(r1.url).not.toBe(r2.url);
  });

  it("учитывает aspectRatio", async () => {
    const r1 = (await StubProvider.generate(
      { prompt: "x", aspectRatio: "1:1" },
      {},
    )) as ImageGenerationResult & { ok: true };
    const r2 = (await StubProvider.generate(
      { prompt: "x", aspectRatio: "16:9" },
      {},
    )) as ImageGenerationResult & { ok: true };
    expect(r1.url).not.toBe(r2.url);
    expect(r1.url).toContain("1x1");
    expect(r2.url).toContain("16x9");
  });
});

describe("UnsplashProvider", () => {
  it("всегда isAvailable", async () => {
    expect(await UnsplashProvider.isAvailable({})).toBe(true);
  });

  it("формирует правильный Unsplash URL с keyword от niche", async () => {
    const r = await UnsplashProvider.generate(
      { prompt: "hero image", niche: "coffee-shop", aspectRatio: "16:9" },
      {},
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toContain("source.unsplash.com");
    expect(r.url).toContain("1600x900");
    expect(r.url.toLowerCase()).toContain("coffee");
  });

  it("извлекает keyword из prompt когда niche нет", async () => {
    const r = await UnsplashProvider.generate(
      { prompt: "уютная кофейня в центре", aspectRatio: "1:1" },
      {},
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toContain("1024x1024");
  });
});

describe("SdWebuiProvider", () => {
  it("isAvailable=false без tunnelUrl", async () => {
    expect(await SdWebuiProvider.isAvailable({})).toBe(false);
  });

  it("пока isAvailable=false даже с tunnelUrl (scaffold)", async () => {
    expect(await SdWebuiProvider.isAvailable({ tunnelUrl: "http://x" })).toBe(false);
  });

  it("генерация возвращает retryable failure без tunnel", async () => {
    const r = await SdWebuiProvider.generate({ prompt: "x" }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
  });
});

describe("generateImage facade", () => {
  it("fallback chain: sd-webui недоступен → unsplash", async () => {
    const r = await generateImage({ prompt: "coffee", aspectRatio: "16:9" });
    if (!r.ok) throw new Error(`unexpected failure: ${r.error}`);
    expect(r.providerId).toBe("unsplash");
  });

  it("preferredProviderId stub — используется первым", async () => {
    const r = await generateImage(
      { prompt: "coffee" },
      { preferredProviderId: "stub" },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.providerId).toBe("stub");
  });

  it("excludeProviders фильтрует", async () => {
    const r = await generateImage(
      { prompt: "coffee" },
      { excludeProviders: ["unsplash", "stub"] },
    );
    // sd-webui isAvailable=false, других нет — полный failure
    expect(r.ok).toBe(false);
  });

  it("preferred + fallback: preferred недоступен → дальше по chain", async () => {
    const r = await generateImage(
      { prompt: "coffee" },
      { preferredProviderId: "sd-webui" }, // недоступен
    );
    if (!r.ok) throw new Error(r.error);
    // Ожидаем fallback на unsplash (не на stub — потому что в default order unsplash раньше)
    expect(r.providerId).toBe("unsplash");
  });

  it("кастомный провайдер включается в chain", async () => {
    const custom: ImageProvider = {
      id: "cool-test" as never,
      name: "Cool",
      description: "",
      capabilities: {
        realGeneration: true,
        offline: true,
        requiresTunnel: false,
        requiresApiKey: false,
      },
      isAvailable: async () => true,
      generate: async () => ({
        ok: true,
        url: "cool://x",
        providerId: "cool-test" as never,
      }),
    };
    registerImageProvider(custom);
    const r = await generateImage(
      { prompt: "x" },
      { preferredProviderId: "cool-test" as never },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.providerId).toBe("cool-test");
    expect(r.url).toBe("cool://x");
  });
});
