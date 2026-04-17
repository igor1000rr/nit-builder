/**
 * promptAnalyzer тесты — проверяет извлечение tone/colors/business name/sections.
 */

import { describe, it, expect } from "vitest";
import { analyzePrompt, buildEnrichedSystemPrompt } from "~/lib/services/promptAnalyzer";

describe("analyzePrompt", () => {
  describe("tone detection", () => {
    it("строгий/деловой промпт → professional", () => {
      expect(analyzePrompt("корпоративный сайт юридической фирмы").tone).toBe("professional");
    });
    it("игривый промпт → playful", () => {
      expect(analyzePrompt("весёлый яркий сайт для детей").tone).toBe("playful");
    });
    it("элегантный промпт → elegant", () => {
      expect(analyzePrompt("премиальный бутиковый сайт").tone).toBe("elegant");
    });
    it("нейтральный промпт → friendly (дефолт)", () => {
      expect(analyzePrompt("сайт магазина").tone).toBe("friendly");
    });
  });

  describe("color hints", () => {
    it("извлекает упомянутые цвета", () => {
      const a = analyzePrompt("тёмный сайт с синим акцентом");
      expect(a.colorHints).toContain("тёмный");
      expect(a.colorHints).toContain("синий");
    });
    it("пустой массив если цветов нет", () => {
      expect(analyzePrompt("просто сайт кофейни").colorHints).toEqual([]);
    });
    it("дедуплицирует: тёмный + dark = один раз", () => {
      const a = analyzePrompt("тёмный dark minimalist");
      expect(a.colorHints.filter((c) => c === "тёмный").length).toBe(1);
    });
  });

  describe("business name extraction", () => {
    it("извлекает имя в кавычках", () => {
      expect(analyzePrompt('сайт компании "Nebula"').businessName).toBe("Nebula");
    });
    it("извлекает имя в «ёлочках»", () => {
      expect(analyzePrompt("сайт брэнда «Rolex»").businessName).toBe("Rolex");
    });
    it("извлекает имя по слову-индикатору 'кафе X'", () => {
      expect(analyzePrompt("сделай сайт для кафе Облако").businessName).toBe("Облако");
    });
    it("возвращает null если имени нет", () => {
      expect(analyzePrompt("просто кофейня").businessName).toBeNull();
    });
  });

  describe("extra sections", () => {
    it("добавляет секции упомянутые юзером но нет в template", () => {
      const a = analyzePrompt("кофейня с отзывами и блогом");
      expect(a.extraSections).toContain("testimonials");
      expect(a.extraSections).toContain("blog");
    });
    it("не дублирует секции которые уже в template", () => {
      const a = analyzePrompt("фотограф с галереей и портфолио");
      // photographer template уже имеет gallery — в extra его не кладём
      expect(a.extraSections).not.toContain("gallery");
    });
  });

  describe("language detection", () => {
    it("преимущественно кириллица → ru", () => {
      expect(analyzePrompt("кофейня в центре города").language).toBe("ru");
    });
    it("преимущественно латиница → en", () => {
      expect(analyzePrompt("downtown coffee shop with minimalist design").language).toBe("en");
    });
    it("равное количество → ru (дефолт прода)", () => {
      expect(analyzePrompt("компания Nebula").language).toBe("ru");
    });
  });

  describe("audience extraction", () => {
    it("извлекает целевую аудиторию после 'для'", () => {
      expect(analyzePrompt("курсы для начинающих программистов").audience).toMatch(/начинающ/);
    });
    it("игнорирует stop-слова (меня, того)", () => {
      expect(analyzePrompt("сделай для меня сайт").audience).toBeNull();
    });
  });

  describe("template integration", () => {
    it("темплейт выбирается по keyword", () => {
      expect(analyzePrompt("барбершоп в центре").template.id).toBe("barbershop");
    });
  });
});

describe("buildEnrichedSystemPrompt", () => {
  it("включает все extracted хинты в system prompt", () => {
    const prompt = 'тёмный сайт для компании "Nebula" с ярким синим акцентом';
    const a = analyzePrompt(prompt);
    const system = buildEnrichedSystemPrompt(prompt, a);

    expect(system).toContain("Nebula");
    expect(system).toContain("синий");
    expect(system).toContain("тёмный");
    expect(system).toContain("<!DOCTYPE html>");
    expect(system).toContain("Tailwind");
    expect(system).toContain("Alpine.js");
  });

  it("указывает язык контента", () => {
    const ruPrompt = "кофейня в центре города";
    const ruSystem = buildEnrichedSystemPrompt(ruPrompt, analyzePrompt(ruPrompt));
    expect(ruSystem).toContain("русском");

    const enPrompt = "downtown coffee shop with minimalist design and pricing";
    const enSystem = buildEnrichedSystemPrompt(enPrompt, analyzePrompt(enPrompt));
    expect(enSystem).toContain("английском");
  });

  it("подключает extra sections к template sections", () => {
    const prompt = "кофейня с отзывами и ценами";
    const a = analyzePrompt(prompt);
    const system = buildEnrichedSystemPrompt(prompt, a);
    expect(system).toContain("testimonials");
    expect(system).toContain("pricing");
  });
});
