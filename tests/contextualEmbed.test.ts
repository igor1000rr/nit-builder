import { describe, it, expect } from "vitest";
import {
  buildContextualText,
  extractQueryContext,
} from "~/lib/services/contextualEmbed";

describe("buildContextualText", () => {
  it("возвращает text без префикса если контекст пустой", () => {
    expect(buildContextualText("кофейня в центре", {})).toBe("кофейня в центре");
  });

  it("добавляет niche в префикс", () => {
    expect(buildContextualText("кофейня", { niche: "coffee-shop" })).toBe(
      "[coffee-shop] кофейня",
    );
  });

  it("объединяет niche + tone + mood через | ", () => {
    const out = buildContextualText("кофейня в центре", {
      niche: "coffee-shop",
      tone: "тёплый, уютный",
      mood: "warm-pastel",
    });
    expect(out).toBe("[coffee-shop | тёплый | warm-pastel] кофейня в центре");
  });

  it("нормализует tone до первого слова через запятую", () => {
    const out = buildContextualText("x", { tone: "строгий, уверенный, без пафоса" });
    expect(out).toBe("[строгий] x");
  });

  it("работает только с mood", () => {
    expect(buildContextualText("x", { mood: "dark-premium" })).toBe("[dark-premium] x");
  });
});

describe("extractQueryContext", () => {
  it("распознаёт coffee-shop по слову бариста", () => {
    const ctx = extractQueryContext("нужен сайт для бариста и эспрессо-машины");
    expect(ctx.niche).toBe("coffee-shop");
  });

  it("распознаёт barbershop", () => {
    expect(extractQueryContext("барбершоп с опасной бритвой").niche).toBe("barbershop");
  });

  it("распознаёт dental", () => {
    expect(extractQueryContext("стоматология для детей").niche).toBe("dental");
  });

  it("распознаёт tattoo", () => {
    expect(extractQueryContext("тату-салон realism и blackwork").niche).toBe("tattoo");
  });

  it("распознаёт food-delivery с КБЖУ", () => {
    expect(extractQueryContext("доставк еды с подсчётом кбжу").niche).toBe(
      "food-delivery",
    );
  });

  it("распознаёт mood premium", () => {
    const ctx = extractQueryContext("премиум спа отель в горах");
    expect(ctx.mood).toBe("dark-premium");
  });

  it("возвращает пустой объект для непонятного запроса", () => {
    const ctx = extractQueryContext("хочу красивый сайт для своего дела");
    expect(ctx.niche).toBeUndefined();
  });

  it("распознаёт нишу даже без явного слова, через корень", () => {
    // 'кофейню' содержит 'кофейн'
    expect(extractQueryContext("открываю кофейню").niche).toBe("coffee-shop");
    // 'клининга' содержит 'клининг'
    expect(extractQueryContext("услуги клининга").niche).toBe("cleaning");
  });

  it("распознаёт niche+mood одновременно", () => {
    const ctx = extractQueryContext("премиум барбершоп для богатых");
    expect(ctx.niche).toBe("barbershop");
    expect(ctx.mood).toBe("dark-premium");
  });
});
