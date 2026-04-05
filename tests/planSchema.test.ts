import { describe, it, expect } from "vitest";
import { PlanSchema, extractPlanJson } from "~/lib/utils/planSchema";

describe("extractPlanJson", () => {
  it("parses clean JSON", () => {
    const raw = '{"foo":"bar"}';
    expect(extractPlanJson(raw)).toEqual({ foo: "bar" });
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"foo":"bar"}\n```';
    expect(extractPlanJson(raw)).toEqual({ foo: "bar" });
  });

  it("extracts JSON from surrounding text", () => {
    const raw = 'Here is the plan: {"business_type":"cafe"} hope you like it';
    expect(extractPlanJson(raw)).toEqual({ business_type: "cafe" });
  });

  it("throws on missing braces", () => {
    expect(() => extractPlanJson("no json here")).toThrow("Plan JSON not found");
  });

  it("throws on malformed JSON", () => {
    expect(() => extractPlanJson("{broken")).toThrow();
  });

  it("handles nested objects", () => {
    const raw = '{"outer":{"inner":"value"},"arr":[1,2,3]}';
    expect(extractPlanJson(raw)).toEqual({
      outer: { inner: "value" },
      arr: [1, 2, 3],
    });
  });
});

describe("PlanSchema", () => {
  const validPlan = {
    business_type: "домашняя кондитерская",
    target_audience: "мамы, свадьбы",
    tone: "тёплый, семейный",
    style_hints: "пастельные тона",
    color_mood: "warm-pastel" as const,
    sections: ["hero", "gallery", "contact"],
    keywords: ["торты", "выпечка"],
    cta_primary: "Заказать",
    language: "ru" as const,
    suggested_template_id: "handmade-shop",
  };

  it("accepts valid plan", () => {
    const result = PlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing optional fields", () => {
    const minimal = {
      business_type: "test",
      sections: ["hero"],
      suggested_template_id: "blank-landing",
    };
    const result = PlanSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toBe("профессиональный");
      expect(result.data.color_mood).toBe("light-minimal");
      expect(result.data.language).toBe("ru");
      expect(result.data.keywords).toEqual([]);
    }
  });

  it("rejects invalid color_mood", () => {
    const bad = { ...validPlan, color_mood: "rainbow-sparkle" };
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty sections array", () => {
    const bad = { ...validPlan, sections: [] };
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing suggested_template_id", () => {
    const { suggested_template_id, ...bad } = validPlan;
    void suggested_template_id;
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects business_type too short", () => {
    const bad = { ...validPlan, business_type: "x" };
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects too many sections", () => {
    const bad = { ...validPlan, sections: Array(13).fill("section") };
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });
});
