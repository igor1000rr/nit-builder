import { describe, expect, it } from "vitest";
import { normalizePlanForRequest } from "~/lib/services/planQuality";
import type { Plan } from "~/lib/utils/planSchema";

const BASE_PLAN: Plan = {
  business_type: "тестовый бизнес",
  target_audience: "",
  tone: "нейтральный",
  style_hints: "",
  color_mood: "light-minimal",
  sections: ["hero", "about", "contact"],
  keywords: [],
  cta_primary: "Связаться",
  language: "ru",
  suggested_template_id: "blank-landing",
};

describe("normalizePlanForRequest", () => {
  it("мапит specialty coffee на coffee-shop и добавляет menu", () => {
    const plan = normalizePlanForRequest(
      { ...BASE_PLAN, suggested_template_id: "fitness-trainer" },
      "элитная спешелти-кофейня с обжарщиком в зале и cupping-сессиями",
    );

    expect(plan.suggested_template_id).toBe("coffee-shop");
    expect(plan.sections).toContain("menu");
  });

  it("мапит tattoo на tattoo-studio", () => {
    const plan = normalizePlanForRequest(
      { ...BASE_PLAN, suggested_template_id: "real-estate" },
      "тату студия realism blackwork эскизы галерея мастера",
    );

    expect(plan.suggested_template_id).toBe("tattoo-studio");
    expect(plan.keywords).toContain("тату");
  });

  it("добавляет programs для детских центров и nutrition-кейсов", () => {
    const kids = normalizePlanForRequest(BASE_PLAN, "детский развивающий центр робототехника");
    const nutrition = normalizePlanForRequest(BASE_PLAN, "нутрициолог КБЖУ планы питания");

    expect(kids.sections).toContain("programs");
    expect(kids.keywords).toContain("детский центр");
    expect(nutrition.sections).toContain("programs");
    expect(nutrition.keywords).toContain("нутрициолог");
    expect(nutrition.keywords).toContain("питание");
    expect(nutrition.keywords).toContain("КБЖУ");
  });

  it("добавляет pricing для формулировки за N часов", () => {
    const plan = normalizePlanForRequest(
      BASE_PLAN,
      "мастер-класс по гончарному делу на двоих романтический вечер за 2 часа",
    );

    expect(plan.sections).toContain("pricing");
    expect(plan.pricing_tiers?.length).toBeGreaterThanOrEqual(2);
    expect(plan.cta_primary).toContain("мастер-класс");
  });

  it("понимает разговорные опечатки про пекарню", () => {
    const plan = normalizePlanForRequest(
      { ...BASE_PLAN, suggested_template_id: "beauty-master", keywords: ["косметика"] },
      "ну тип нужон сайтик для маей пакарни нюансики обсудим патом главное чтоб красиво",
    );

    expect(plan.suggested_template_id).toBe("coffee-shop");
    expect(plan.sections).toContain("menu");
    expect(plan.keywords).toEqual(expect.arrayContaining(["пекарня", "хлеб"]));
  });

  it("добавляет services и keywords для химчистки мебели", () => {
    const plan = normalizePlanForRequest(
      BASE_PLAN,
      "химчистка элитной мебели реставрация дорогих диванов и ковров на дому",
    );

    expect(plan.sections).toContain("services");
    expect(plan.keywords).toEqual(expect.arrayContaining(["химчистка", "диван", "ковер"]));
  });

  it("не даёт translation уходить в medical-clinic", () => {
    const plan = normalizePlanForRequest(
      { ...BASE_PLAN, suggested_template_id: "medical-clinic" },
      "медицинский перевод документов для лечения в Германии и Израиле",
    );

    expect(plan.suggested_template_id).toBe("blank-landing");
  });
});
