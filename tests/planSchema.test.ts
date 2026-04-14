import { describe, it, expect } from "vitest";
import { PlanSchema, buildCopyHint, extractPlanJson } from "~/lib/utils/planSchema";

const MIN_VALID = {
  business_type: "кофейня",
  sections: ["hero"],
  suggested_template_id: "coffee-shop",
};

describe("PlanSchema backward-compat", () => {
  it("принимает минимальный legacy plan без копирайт-полей", () => {
    const parsed = PlanSchema.safeParse(MIN_VALID);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hero_headline).toBeUndefined();
      expect(parsed.data.key_benefits).toBeUndefined();
    }
  });

  it("принимает plan со всеми копирайт-полями", () => {
    const plan = {
      ...MIN_VALID,
      hero_headline: "Свежий кофе утром",
      hero_subheadline: "Варим с 6 утра на камне, зёрна из Колумбии.",
      key_benefits: [
        { title: "Своя обжарка", description: "Обжариваем зёрна два раза в неделю." },
        { title: "Без сетевых компромиссов", description: "2 точки в Минске, бариста лично." },
        { title: "Завтраки до 14:00", description: "Сырники, гранола, тосты с авокадо." },
      ],
      social_proof_line: "Более 300 постоянных гостей",
      cta_microcopy: "Без резерва, просто заходите",
    };
    const parsed = PlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("отклоняет key_benefits с менее 3 пунктов", () => {
    const plan = {
      ...MIN_VALID,
      key_benefits: [{ title: "One", description: "Only one item" }],
    };
    expect(PlanSchema.safeParse(plan).success).toBe(false);
  });

  it("отклоняет key_benefits с больше 5 пунктов", () => {
    const plan = {
      ...MIN_VALID,
      key_benefits: Array.from({ length: 6 }, (_, i) => ({
        title: `T${i}`,
        description: "description that is long enough",
      })),
    };
    expect(PlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe("buildCopyHint", () => {
  it("возвращает null для legacy plan без копирайта", () => {
    const plan = PlanSchema.parse(MIN_VALID);
    expect(buildCopyHint(plan)).toBeNull();
  });

  it("собирает все доступные поля", () => {
    const plan = PlanSchema.parse({
      ...MIN_VALID,
      hero_headline: "Заголовок",
      hero_subheadline: "Подзаголовок",
      key_benefits: [
        { title: "A", description: "First benefit here" },
        { title: "B", description: "Second benefit here" },
        { title: "C", description: "Third benefit here" },
      ],
      social_proof_line: "Социальное доказательство",
      cta_microcopy: "Без предоплаты",
    });
    const hint = buildCopyHint(plan);
    expect(hint).not.toBeNull();
    expect(hint).toContain("Заголовок");
    expect(hint).toContain("Подзаголовок");
    expect(hint).toContain("First benefit here");
    expect(hint).toContain("Социальное доказательство");
    expect(hint).toContain("Без предоплаты");
    expect(hint).toContain("дословно");
  });

  it("частичные поля — включает только то что есть", () => {
    const plan = PlanSchema.parse({
      ...MIN_VALID,
      hero_headline: "Онли заголовок",
    });
    const hint = buildCopyHint(plan);
    expect(hint).toContain("Онли заголовок");
    expect(hint).not.toContain("BENEFITS");
    expect(hint).not.toContain("MICROCOPY");
  });
});

describe("extractPlanJson", () => {
  it("парсит чистый JSON", () => {
    expect(extractPlanJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("срезает markdown fences", () => {
    expect(extractPlanJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("извлекает JSON из мусора вокруг", () => {
    expect(extractPlanJson('some noise {"a":1} trailing')).toEqual({ a: 1 });
  });

  it("бросает если нет JSON", () => {
    expect(() => extractPlanJson("no json here")).toThrow();
  });
});
