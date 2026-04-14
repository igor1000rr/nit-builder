import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeQuery,
  getCachedPlan,
  setCachedPlan,
  clearPlanCache,
  planCacheStats,
} from "~/lib/services/planCache";
import type { Plan } from "~/lib/utils/planSchema";

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    business_type: "кофейня",
    target_audience: "",
    tone: "тёплый",
    style_hints: "",
    color_mood: "warm-pastel",
    sections: ["hero", "menu"],
    keywords: ["кофе"],
    cta_primary: "Заказать",
    language: "ru",
    suggested_template_id: "coffee-shop",
    ...overrides,
  };
}

describe("normalizeQuery", () => {
  it("lowercases input", () => {
    expect(normalizeQuery("САЙТ КОФЕЙНИ")).toBe("сайт кофейни");
  });

  it("removes punctuation", () => {
    expect(normalizeQuery("сайт, для! кофейни?")).toBe("сайт для кофейни");
  });

  it("collapses whitespace", () => {
    expect(normalizeQuery("сайт   для    кофейни")).toBe("сайт для кофейни");
  });

  it("preserves cyrillic letters and digits", () => {
    expect(normalizeQuery("кафе Минск 2024")).toBe("кафе минск 2024");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeQuery("  сайт  ")).toBe("сайт");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("plan cache", () => {
  beforeEach(() => clearPlanCache());

  it("returns null for empty cache", () => {
    expect(getCachedPlan("кофейня")).toBeNull();
  });

  it("stores and retrieves plan by exact query", () => {
    const plan = makePlan();
    setCachedPlan("сайт для кофейни", plan);
    expect(getCachedPlan("сайт для кофейни")).toEqual(plan);
  });

  it("matches semantically equivalent queries via normalization", () => {
    const plan = makePlan();
    setCachedPlan("сайт для кофейни в Минске", plan);
    expect(getCachedPlan("САЙТ для кофейни! в Минске?")).toEqual(plan);
    expect(getCachedPlan("сайт   для   кофейни в минске")).toEqual(plan);
  });

  it("different queries produce different cache entries", () => {
    setCachedPlan("кофейня", makePlan({ business_type: "кофейня" }));
    setCachedPlan("барбершоп", makePlan({ business_type: "барбершоп" }));
    expect(getCachedPlan("кофейня")?.business_type).toBe("кофейня");
    expect(getCachedPlan("барбершоп")?.business_type).toBe("барбершоп");
  });

  it("empty/whitespace queries are not cached", () => {
    setCachedPlan("   ", makePlan());
    expect(getCachedPlan("   ")).toBeNull();
    expect(planCacheStats().size).toBe(0);
  });

  it("clearPlanCache empties storage", () => {
    setCachedPlan("x", makePlan());
    expect(planCacheStats().size).toBe(1);
    clearPlanCache();
    expect(planCacheStats().size).toBe(0);
  });
});
