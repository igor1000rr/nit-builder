import { describe, it, expect } from "vitest";
import { classifyPolishIntent, detectSectionTarget } from "~/lib/services/intentClassifier";

describe("classifyPolishIntent", () => {
  describe("чистые style-запросы → css_patch", () => {
    const styleQueries = [
      "сделай фон синим",
      "поменяй цвет на красный",
      "в тёмную тему",
      "сделай светлее",
      "больше отступов",
      "измени шрифт на жирный",
      "скругли кнопки",
      "кнопки в розовый",
      "make it dark",
      "font bigger",
    ];
    for (const q of styleQueries) {
      it(`"${q}"`, () => {
        expect(classifyPolishIntent(q).intent).toBe("css_patch");
      });
    }
  });

  describe("структурные запросы → full_rewrite", () => {
    const structuralQueries = [
      "добавь секцию отзывы",
      "убери блок цен",
      "удали меню",
      "перенеси футер наверх",
      "перепиши заголовок",
      "переименуй секцию о нас",
      "придумай новый слоган",
      "новый баннер сверху",
      "замени текст в герое",
      "создай блок фактов",
    ];
    for (const q of structuralQueries) {
      it(`"${q}"`, () => {
        expect(classifyPolishIntent(q).intent).toBe("full_rewrite");
      });
    }
  });

  it("structural приоритетнее style", () => {
    const c = classifyPolishIntent("добавь красную секцию отзывов");
    expect(c.intent).toBe("full_rewrite");
    expect(c.styleHits).toBeGreaterThan(0);
    expect(c.structuralHits).toBeGreaterThan(0);
  });

  it("edge: пусто → full_rewrite low", () => {
    const c = classifyPolishIntent("");
    expect(c.intent).toBe("full_rewrite");
    expect(c.confidence).toBe("low");
  });

  it("edge: не распознано → full_rewrite", () => {
    expect(classifyPolishIntent("хмм не знаю").intent).toBe("full_rewrite");
  });

  it("много style hits → high confidence", () => {
    const c = classifyPolishIntent("сделай фон синим и шрифт покрупнее");
    expect(c.intent).toBe("css_patch");
    expect(c.confidence).toBe("high");
  });

  it("всегда содержит targetSection (null если нет)", () => {
    expect(classifyPolishIntent("сделай фон синим").targetSection).toBeNull();
    expect(classifyPolishIntent("сделай героя синим").targetSection).toBe("hero");
  });
});

describe("detectSectionTarget", () => {
  const cases: Array<[string, string | null]> = [
    ["сделай героя синим", "hero"],
    ["шапку тёмнее", "hero"],
    ["первый экран подкрась", "hero"],
    ["верхнюю часть в синий", "hero"],
    ["меню чуть крупнее", "menu"],
    ["цены ярче", "pricing"],
    ["тарифы в тёмном", "pricing"],
    ["контакты на зелёный", "contact"],
    ["отзывы на светлом фоне", "testimonials"],
    ["фичи ярче", "features"],
    ["галерею чуть больше", "gallery"],
    ["о нас покрупнее", "about"],
    ["cta зелёный", "cta"],
    ["футер тёмнее", "footer"],
    ["подвал светлее", "footer"],
    ["сделай сайт синим", null],
    ["фон красный", null],
    ["", null],
  ];
  for (const [q, expected] of cases) {
    it(`"${q}" → ${expected}`, () => {
      expect(detectSectionTarget(q)).toBe(expected);
    });
  }
});
