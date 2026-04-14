import { describe, it, expect } from "vitest";
import {
  classifyPolishIntent,
  detectSectionId,
} from "~/lib/services/intentClassifier";

describe("classifyPolishIntent", () => {
  describe("style-запросы → css_patch", () => {
    const styleQueries = [
      "сделай фон синим",
      "поменяй цвет на красный",
      "в тёмную тему",
      "сделай светлее",
      "больше отступов",
      "скругли кнопки",
      "make it dark",
      "font bigger",
    ];
    for (const q of styleQueries) {
      it(`"${q}"`, () => {
        expect(classifyPolishIntent(q).intent).toBe("css_patch");
      });
    }
  });

  describe("structural-запросы → full_rewrite", () => {
    const structuralQueries = [
      "добавь секцию отзывы",
      "убери блок цен",
      "удали меню",
      "перенеси футер наверх",
      "перепиши заголовок",
      "придумай новый слоган",
      "новый баннер сверху",
      "создай блок фактов",
    ];
    for (const q of structuralQueries) {
      it(`"${q}"`, () => {
        expect(classifyPolishIntent(q).intent).toBe("full_rewrite");
      });
    }
  });

  describe("section detection", () => {
    it("\"сделай героя синим\" → css_patch + sectionId=hero", () => {
      const c = classifyPolishIntent("сделай героя синим");
      expect(c.intent).toBe("css_patch");
      expect(c.sectionId).toBe("hero");
    });

    it("\"в секции цен покрупнее\" → sectionId=pricing", () => {
      const c = classifyPolishIntent("в секции цен заголовки покрупнее");
      expect(c.intent).toBe("css_patch");
      expect(c.sectionId).toBe("pricing");
    });

    it("\"футер в тёмный\" → sectionId=footer", () => {
      const c = classifyPolishIntent("футер в тёмный");
      expect(c.intent).toBe("css_patch");
      expect(c.sectionId).toBe("footer");
    });

    it("глобальный запрос без упоминания секции → sectionId=undefined", () => {
      const c = classifyPolishIntent("сделай фон синим");
      expect(c.sectionId).toBeUndefined();
    });

    it("учитывает availableSectionIds (не выдаёт menu если его нет)", () => {
      const c = classifyPolishIntent("в меню кнопки покрупнее", ["hero", "contact"]);
      expect(c.sectionId).toBeUndefined();
    });

    it("выдаёт sectionId если он есть в availableSectionIds", () => {
      const c = classifyPolishIntent("в меню кнопки покрупнее", ["hero", "menu"]);
      expect(c.sectionId).toBe("menu");
    });
  });

  describe("edge cases", () => {
    it("пустой запрос → full_rewrite low confidence", () => {
      const c = classifyPolishIntent("");
      expect(c.intent).toBe("full_rewrite");
      expect(c.confidence).toBe("low");
    });

    it("нераспознанный → full_rewrite safe default", () => {
      const c = classifyPolishIntent("хмм не знаю");
      expect(c.intent).toBe("full_rewrite");
    });

    it("high confidence на множественных style hit'ах", () => {
      const c = classifyPolishIntent("сделай фон синим и шрифт покрупнее");
      expect(c.intent).toBe("css_patch");
      expect(c.confidence).toBe("high");
    });
  });
});

describe("detectSectionId", () => {
  it("находит hero по синонимам", () => {
    expect(detectSectionId("сделай героя синим")).toBe("hero");
    expect(detectSectionId("первый экран ярче")).toBe("hero");
    expect(detectSectionId("hero background")).toBe("hero");
  });

  it("находит pricing", () => {
    expect(detectSectionId("в секции цен")).toBe("pricing");
    expect(detectSectionId("тарифы другого цвета")).toBe("pricing");
  });

  it("находит contact", () => {
    expect(detectSectionId("контакты перекрась")).toBe("contact");
  });

  it("undefined для неупоминаемой секции", () => {
    expect(detectSectionId("сделай фон синим")).toBeUndefined();
  });

  it("уважает availableIds", () => {
    expect(detectSectionId("в меню кнопки", ["hero"])).toBeUndefined();
    expect(detectSectionId("в меню кнопки", ["hero", "menu"])).toBe("menu");
  });
});
