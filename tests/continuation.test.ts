import { describe, it, expect } from "vitest";
import {
  joinPartialAndContinuation,
  cleanRawForTail,
  extractTail,
  buildContinuationUserMessage,
  CONTINUATION_SYSTEM_PROMPT,
  MAX_CONTINUATION_ATTEMPTS,
  CONTINUATION_TAIL_CHARS,
} from "~/lib/services/continuation";

describe("joinPartialAndContinuation", () => {
  it("клеит без перекрытия", () => {
    expect(joinPartialAndContinuation("<div>start", " end</div>")).toBe("<div>start end</div>");
  });

  it("удаляет перекрытие когда модель повторила хвост", () => {
    const partial = '<div class="container mx-auto p-4">Start of very long content here';
    const continuation =
      'container mx-auto p-4">Start of very long content here and continuation</div>';
    const joined = joinPartialAndContinuation(partial, continuation);
    expect(joined).toBe(
      '<div class="container mx-auto p-4">Start of very long content here and continuation</div>',
    );
  });

  it("не удаляет перекрытия короче 20 символов (риск false positive)", () => {
    const partial = "short text aaa";
    const continuation = "aaa continued";
    // 'aaa' слишком коротко — не должно считаться перекрытием
    expect(joinPartialAndContinuation(partial, continuation)).toBe(partial + continuation);
  });

  it("пустые входы", () => {
    expect(joinPartialAndContinuation("", "abc")).toBe("abc");
    expect(joinPartialAndContinuation("abc", "")).toBe("abc");
    expect(joinPartialAndContinuation("", "")).toBe("");
  });
});

describe("cleanRawForTail", () => {
  it("убирает ведущий ```html", () => {
    expect(cleanRawForTail("```html\n<html>x")).toBe("<html>x");
  });

  it("убирает trailing ```", () => {
    expect(cleanRawForTail("<html>x\n```")).toBe("<html>x");
  });

  it("НЕ дописывает </html> если его нет (partial!)", () => {
    const partial = "<!DOCTYPE html><html><body><div>incomplete";
    expect(cleanRawForTail(partial)).toBe(partial);
  });
});

describe("extractTail", () => {
  it("короткий HTML — весь целиком", () => {
    expect(extractTail("<div>x</div>")).toBe("<div>x</div>");
  });

  it("длинный — только последние N", () => {
    const html = "a".repeat(3000);
    const tail = extractTail(html, 500);
    expect(tail.length).toBe(500);
  });
});

describe("buildContinuationUserMessage", () => {
  it("включает userMessage и tail", () => {
    const msg = buildContinuationUserMessage({
      userMessage: "сайт кофейни",
      tail: "<div>partial",
    });
    expect(msg).toContain("сайт кофейни");
    expect(msg).toContain("<div>partial");
    expect(msg).toContain("TAIL");
  });

  it("добавляет план если дан", () => {
    const msg = buildContinuationUserMessage({
      userMessage: "x",
      tail: "y",
      plan: {
        business_type: "кофейня",
        target_audience: "",
        tone: "тёплый",
        style_hints: "",
        color_mood: "warm-pastel",
        sections: ["hero", "menu"],
        keywords: [],
        cta_primary: "Заказать",
        language: "ru",
        suggested_template_id: "coffee-shop",
      },
    });
    expect(msg).toContain("warm-pastel");
    expect(msg).toContain("hero");
  });
});

describe("CONTINUATION_SYSTEM_PROMPT", () => {
  it("запрещает начинать с DOCTYPE", () => {
    expect(CONTINUATION_SYSTEM_PROMPT).toContain("<!DOCTYPE>");
    expect(CONTINUATION_SYSTEM_PROMPT.toLowerCase()).toContain("не начинай");
  });

  it("разумные константы", () => {
    expect(MAX_CONTINUATION_ATTEMPTS).toBeGreaterThanOrEqual(1);
    expect(MAX_CONTINUATION_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(CONTINUATION_TAIL_CHARS).toBeGreaterThanOrEqual(500);
    expect(CONTINUATION_TAIL_CHARS).toBeLessThanOrEqual(3000);
  });
});
