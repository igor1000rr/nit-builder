import { describe, it, expect } from "vitest";
import { formatPlanCompact, approxTokenCount } from "~/lib/services/compactPlanFormat";
import type { Plan } from "~/lib/utils/planSchema";

const FULL_PLAN: Plan = {
  business_type: "specialty-кофейня в центре",
  target_audience: "офисные работники, молодёжь",
  tone: "тёплый, уютный",
  style_hints: "крупные фото, пастель",
  color_mood: "warm-pastel",
  sections: ["hero", "menu", "about"],
  keywords: ["кофе", "эспрессо"],
  cta_primary: "Смотреть меню",
  language: "ru",
  suggested_template_id: "coffee-shop",
  hero_headline: "Кофе варят те, кто им живёт",
  hero_subheadline: "Обжариваем зерно из Колумбии каждую пятницу.",
  key_benefits: [
    { title: "Свежая обжарка", description: "Зерно уходит в помол через 7 дней." },
    { title: "Бариста-перфекционист", description: "3 месяца стажировки." },
    { title: "Альтернатива эспрессо", description: "V60, кемекс, аэропресс." },
  ],
  social_proof_line: "Более 500 гостей и 4.9 на Google Maps",
  cta_microcopy: "Без резерва",
};

describe("formatPlanCompact", () => {
  it("возвращает многострочный текст с шапкой и секциями", () => {
    const out = formatPlanCompact(FULL_PLAN);
    expect(out).toContain("business: specialty-кофейня");
    expect(out).toContain("audience:");
    expect(out).toContain("tone:");
    expect(out).toContain("mood: warm-pastel");
    expect(out).toContain("template: coffee-shop");
    expect(out).toContain("sections: hero,menu,about");
    expect(out).toContain("HERO: Кофе варят те, кто им живёт");
    expect(out).toContain("BENEFITS:");
    expect(out).toContain("- Свежая обжарка → Зерно");
    expect(out).toContain("PROOF: Более 500 гостей");
  });

  it("включает microcopy в строку cta", () => {
    const out = formatPlanCompact(FULL_PLAN);
    expect(out).toContain("cta: Смотреть меню (Без резерва)");
  });

  it("работает с минимальным планом без optional полей", () => {
    const minimal: Plan = {
      business_type: "тест",
      target_audience: "",
      tone: "",
      style_hints: "",
      color_mood: "light-minimal",
      sections: ["hero"],
      keywords: [],
      cta_primary: "Связаться",
      language: "ru",
      suggested_template_id: "blank-landing",
    };
    const out = formatPlanCompact(minimal);
    expect(out).toContain("business: тест");
    expect(out).toContain("cta: Связаться");
    expect(out).not.toContain("HERO:");
    expect(out).not.toContain("BENEFITS:");
    expect(out).not.toContain("PROOF:");
  });

  it("даёт меньше токенов чем JSON.stringify", () => {
    const compact = formatPlanCompact(FULL_PLAN);
    const json = JSON.stringify(FULL_PLAN);
    expect(approxTokenCount(compact)).toBeLessThan(approxTokenCount(json));
  });

  it("схлопывает многострочные description в одну строку", () => {
    const planWithMultiline: Plan = {
      ...FULL_PLAN,
      key_benefits: [
        {
          title: "Test",
          description: "Line one.\nLine two.\nLine three.",
        },
      ],
    };
    const out = formatPlanCompact(planWithMultiline);
    expect(out).toContain("- Test → Line one. Line two. Line three.");
    expect(out.split("\n").filter((l) => l.startsWith("  - ")).length).toBe(1);
  });
});

describe("approxTokenCount", () => {
  it("приближённо считает токены через chars/4", () => {
    expect(approxTokenCount("")).toBe(0);
    expect(approxTokenCount("abcd")).toBe(1);
    expect(approxTokenCount("hello world")).toBe(3);
  });
});
