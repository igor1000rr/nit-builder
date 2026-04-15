import { describe, it, expect } from "vitest";
import {
  classifyPolishIntent,
  extractTargetSection,
  extractTargetSections,
} from "~/lib/services/intentClassifier";
import { detectExtendedTriggers } from "~/lib/services/extendedTriggers";
import { tokenize } from "~/lib/services/bm25";

/**
 * Регрессионная защита от unicode-bug.
 *
 * История бага. До коммита bb7e62a весь intentClassifier и часть
 * extendedTriggers использовали обычный JS regex с `\b` и `\w` — оба ASCII-only.
 * Для кириллицы `\b` молча не срабатывал, и:
 *   - polisher всегда возвращал full_rewrite (никогда css_patch) для русских запросов
 *   - extended trigger boost не работал для падежей ("режимом работы")
 *   - bm25 tokenize терял одиночные русские буквы
 *
 * Этот файл проверяет конкретные кириллические кейсы. Если кто-то снимет
 * флаг `u` или вернёт `\b` без `\p{L}` boundaries — упадёт минимум один тест.
 */

describe("regression: unicode-aware regex для кириллицы", () => {
  describe("intentClassifier распознаёт кириллические синонимы секций", () => {
    const cyrillicCases: Array<[string, string]> = [
      ["сделай героя синим", "hero"],
      ["в герое поменяй цвет", "hero"],
      ["шапку покрупнее", "hero"],
      ["прайс жёлтым", "pricing"],
      ["в тарифах подсветка", "pricing"],
      ["галерея с тенью", "gallery"],
      ["в контактах фон", "contact"],
      ["футер темнее", "footer"],
      ["подвал тёмный", "footer"],
      ["в отзывах увеличь шрифт", "testimonials"],
      ["фичи в синем", "features"],
    ];

    for (const [query, expected] of cyrillicCases) {
      it(`"${query}" → ${expected}`, () => {
        expect(extractTargetSection(query)).toBe(expected);
      });
    }
  });

  describe("intentClassifier polish intent на кириллических запросах", () => {
    it("'сделай героя синим' → css_patch (style + section)", () => {
      const r = classifyPolishIntent("сделай героя синим");
      expect(r.intent).toBe("css_patch");
      expect(r.targetSection).toBe("hero");
      expect(r.styleHits).toBeGreaterThan(0);
    });

    it("'добавь секцию отзывы' → full_rewrite (structural)", () => {
      const r = classifyPolishIntent("добавь секцию отзывы");
      expect(r.intent).toBe("full_rewrite");
      expect(r.structuralHits).toBeGreaterThan(0);
    });

    it("'переделай контент целиком' → full_rewrite", () => {
      const r = classifyPolishIntent("переделай контент целиком");
      expect(r.intent).toBe("full_rewrite");
      expect(r.structuralHits).toBeGreaterThan(0);
    });
  });

  describe("extractTargetSections — multi-section, дедупликация, кириллица", () => {
    it("'hero и pricing' → оба", () => {
      const r = extractTargetSections("hero и pricing сделай синими");
      expect(r).toContain("hero");
      expect(r).toContain("pricing");
    });

    it("'герой и hero и шапка' → один hero (дедуп)", () => {
      const r = extractTargetSections("в герое и hero и шапке поменяй");
      expect(r.filter((s) => s === "hero")).toHaveLength(1);
    });

    it("'heroes академия' → не матчит hero (word boundary)", () => {
      // Защита от ложных срабатываний: \bhero\b не должен матчить heroes.
      // Именно эта регрессия может вернуться при неправильной unicode-границе.
      expect(extractTargetSections("heroes академия")).toEqual([]);
    });
  });

  describe("extendedTriggers — падежи и склонения через \\p{L}", () => {
    it("'режимом работы' → hours (творительный падеж)", () => {
      expect(detectExtendedTriggers("в режимом работы изменения").hours).toBe(true);
    });

    it("'графика работы' → hours (родительный падеж)", () => {
      expect(detectExtendedTriggers("указать графика работы салона").hours).toBe(true);
    });

    it("'часов работы' → hours", () => {
      expect(detectExtendedTriggers("сколько часов работы в день").hours).toBe(true);
    });

    it("одновременно несколько триггеров", () => {
      const t = detectExtendedTriggers(
        "барбершоп с прайсом, FAQ и режимом работы, телефон обязательно",
      );
      expect(t.pricing).toBe(true);
      expect(t.faq).toBe(true);
      expect(t.hours).toBe(true);
      expect(t.contact).toBe(true);
    });
  });

  describe("bm25 tokenize — кириллица + одиночные цифры", () => {
    it("сохраняет одиночные цифры (балл, класс)", () => {
      const tokens = tokenize("IELTS 7.0 за 4 месяца");
      expect(tokens).toContain("4");
      expect(tokens).toContain("7.0");
    });

    it("сохраняет дефисные кириллические термины", () => {
      const tokens = tokenize("b2b-сервис");
      expect(tokens.some((t) => t.includes("сервис"))).toBe(true);
    });

    it("стеммит русские падежи к общему стему", () => {
      // винительный/именительный должны сводиться к одному
      const acc = tokenize("открываю кофейню");
      const nom = tokenize("кофейня");
      // оба содержат токен начинающийся с "кофей"
      expect(acc.some((t) => t.startsWith("кофей"))).toBe(true);
      expect(nom.some((t) => t.startsWith("кофей"))).toBe(true);
    });
  });
});
