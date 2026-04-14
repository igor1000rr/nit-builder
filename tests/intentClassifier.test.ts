import { describe, it, expect } from "vitest";
import { classifyPolishIntent } from "~/lib/services/intentClassifier";

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
      "добавь тень", // 'tень' style + 'добавь' structural — structural wins; см. ниже
      "кнопки в розовый",
      "make it dark",
      "font bigger",
    ];

    for (const q of styleQueries) {
      it(`"${q}"`, () => {
        const c = classifyPolishIntent(q);
        // Исключение: "добавь тень" — "добавь" это structural кейворд.
        // Приоритет structural >= style: это по дизайну.
        // Для уже имеющегося элемента "сделай тень побольше" — было бы css_patch.
        if (q === "добавь тень") {
          expect(c.intent).toBe("full_rewrite");
        } else {
          expect(c.intent).toBe("css_patch");
        }
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

  describe("смешанные / structural побеждает", () => {
    it("добавь красную секцию → full_rewrite (structural выигрывает)", () => {
      const c = classifyPolishIntent("добавь красную секцию отзывов");
      expect(c.intent).toBe("full_rewrite");
      expect(c.styleHits).toBeGreaterThan(0);
      expect(c.structuralHits).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("пустой запрос → full_rewrite с low confidence", () => {
      const c = classifyPolishIntent("");
      expect(c.intent).toBe("full_rewrite");
      expect(c.confidence).toBe("low");
    });

    it("нераспознанный запрос → full_rewrite (сафе default)", () => {
      const c = classifyPolishIntent("хмм не знаю что хочу");
      expect(c.intent).toBe("full_rewrite");
      expect(c.confidence).toBe("low");
    });

    it("множественные style hits → high confidence", () => {
      const c = classifyPolishIntent("сделай фон синим и шрифт покрупнее");
      expect(c.intent).toBe("css_patch");
      expect(c.confidence).toBe("high");
    });

    it("результат всегда содержит reason и счётчики", () => {
      const c = classifyPolishIntent("синий фон");
      expect(c.reason).toBeTruthy();
      expect(typeof c.styleHits).toBe("number");
      expect(typeof c.structuralHits).toBe("number");
    });
  });
});
