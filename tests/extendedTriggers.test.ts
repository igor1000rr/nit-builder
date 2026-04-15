import { describe, it, expect, beforeEach } from "vitest";
import {
  detectExtendedTriggers,
  hasAnyTrigger,
  countTriggerMatches,
  applyExtendedTriggerBoost,
} from "~/lib/services/extendedTriggers";
import type { Plan } from "~/lib/utils/planSchema";

const basePlan: Plan = {
  business_type: "test",
  target_audience: "",
  tone: "",
  style_hints: "",
  color_mood: "light-minimal",
  sections: ["hero"],
  keywords: [],
  cta_primary: "CTA",
  language: "ru",
  suggested_template_id: "blank-landing",
};

const pricingTiers = [
  { name: "Старт", price: "₽1 500", features: ["a", "b"] },
  { name: "Pro", price: "₽3 500", features: ["c", "d", "e"] },
];
const faqItems = [
  { question: "вопрос 1?", answer: "ответ 1" },
  { question: "вопрос 2?", answer: "ответ 2" },
  { question: "вопрос 3?", answer: "ответ 3" },
];

beforeEach(() => {
  delete process.env.NIT_EXTENDED_TRIGGER_BOOST_ENABLED;
  delete process.env.NIT_EXTENDED_TRIGGER_BOOST_AMOUNT;
});

describe("detectExtendedTriggers — pricing", () => {
  it("находит pricing-триггеры из htmlPrompts whitelist", () => {
    expect(detectExtendedTriggers("сайт для саас с тарифами").pricing).toBe(true);
    expect(detectExtendedTriggers("укажи прайс на услуги").pricing).toBe(true);
    expect(detectExtendedTriggers("покажи цены").pricing).toBe(true);
    expect(detectExtendedTriggers("стоимость работ").pricing).toBe(true);
    expect(detectExtendedTriggers("99 ₽/мес").pricing).toBe(true);
    expect(detectExtendedTriggers("от 4990 руб/мес").pricing).toBe(true);
    expect(detectExtendedTriggers("в рассрочку").pricing).toBe(true);
  });

  it("regex 'от X руб|₽'", () => {
    expect(detectExtendedTriggers("от 1500 руб").pricing).toBe(true);
    expect(detectExtendedTriggers("от 1500 ₽").pricing).toBe(true);
    expect(detectExtendedTriggers("От  990  руб").pricing).toBe(true);
  });
});

describe("detectExtendedTriggers — faq", () => {
  it("находит faq-триггеры", () => {
    expect(detectExtendedTriggers("добавь FAQ блок").faq).toBe(true);
    expect(detectExtendedTriggers("частые вопросы клиентов").faq).toBe(true);
    expect(detectExtendedTriggers("ответы на вопросы").faq).toBe(true);
    expect(detectExtendedTriggers("раздел ЧАВО").faq).toBe(true);
    expect(detectExtendedTriggers("вопрос-ответ").faq).toBe(true);
  });
});

describe("detectExtendedTriggers — hours", () => {
  it("находит hours-триггеры", () => {
    expect(detectExtendedTriggers("часы работы салона").hours).toBe(true);
    expect(detectExtendedTriggers("режим работы магазина").hours).toBe(true);
    expect(detectExtendedTriggers("график работы клиники").hours).toBe(true);
    expect(detectExtendedTriggers("работаем круглосуточно").hours).toBe(true);
    expect(detectExtendedTriggers("работаем 24/7").hours).toBe(true);
  });

  it("regex 'работаем с N'", () => {
    expect(detectExtendedTriggers("работаем с 9 до 21").hours).toBe(true);
    expect(detectExtendedTriggers("Работаем  с  10:00").hours).toBe(true);
  });
});

describe("detectExtendedTriggers — contact", () => {
  it("находит contact-триггеры", () => {
    expect(detectExtendedTriggers("телефон для связи").contact).toBe(true);
    expect(detectExtendedTriggers("можно позвонить").contact).toBe(true);
    expect(detectExtendedTriggers("адрес офиса").contact).toBe(true);
    expect(detectExtendedTriggers("находимся в центре").contact).toBe(true);
    expect(detectExtendedTriggers("приходите к нам").contact).toBe(true);
    expect(detectExtendedTriggers("офис в Москве").contact).toBe(true);
  });
});

describe("detectExtendedTriggers — общее", () => {
  it("без триггеров → всё false", () => {
    const t = detectExtendedTriggers("простой сайт для блога о кошках");
    expect(t.pricing).toBe(false);
    expect(t.faq).toBe(false);
    expect(t.hours).toBe(false);
    expect(t.contact).toBe(false);
  });

  it("case insensitive", () => {
    expect(detectExtendedTriggers("ТАРИФЫ").pricing).toBe(true);
    expect(detectExtendedTriggers("Faq").faq).toBe(true);
    expect(detectExtendedTriggers("ЧАСЫ РАБОТЫ").hours).toBe(true);
  });

  it("множественные триггеры в одном запросе", () => {
    const t = detectExtendedTriggers(
      "барбершоп с прайсом, FAQ и режимом работы, телефон обязательно",
    );
    expect(t.pricing).toBe(true);
    expect(t.faq).toBe(true);
    expect(t.hours).toBe(true);
    expect(t.contact).toBe(true);
  });
});

describe("hasAnyTrigger", () => {
  it("true когда хоть один true", () => {
    expect(
      hasAnyTrigger({ pricing: true, faq: false, hours: false, contact: false }),
    ).toBe(true);
    expect(
      hasAnyTrigger({ pricing: false, faq: false, hours: false, contact: true }),
    ).toBe(true);
  });
  it("false когда все false", () => {
    expect(
      hasAnyTrigger({ pricing: false, faq: false, hours: false, contact: false }),
    ).toBe(false);
  });
});

describe("countTriggerMatches", () => {
  it("0 для plan без extended-полей даже когда все триггеры включены", () => {
    const t = { pricing: true, faq: true, hours: true, contact: true };
    expect(countTriggerMatches(basePlan, t)).toBe(0);
  });

  it("0 для undefined plan", () => {
    const t = { pricing: true, faq: true, hours: true, contact: true };
    expect(countTriggerMatches(undefined, t)).toBe(0);
  });

  it("+1 за каждое triggered+filled поле", () => {
    const planFull: Plan = {
      ...basePlan,
      pricing_tiers: pricingTiers,
      faq: faqItems,
      hours_text: "Пн-Пт 9-18",
      contact_phone: "+7 495 123",
    };
    expect(
      countTriggerMatches(planFull, {
        pricing: true,
        faq: false,
        hours: false,
        contact: false,
      }),
    ).toBe(1);
    expect(
      countTriggerMatches(planFull, {
        pricing: true,
        faq: true,
        hours: false,
        contact: false,
      }),
    ).toBe(2);
    expect(
      countTriggerMatches(planFull, {
        pricing: true,
        faq: true,
        hours: true,
        contact: true,
      }),
    ).toBe(4);
  });

  it("contact матчится через email или address (не только phone)", () => {
    const planEmail: Plan = { ...basePlan, contact_email: "x@y.ru" };
    const planAddr: Plan = { ...basePlan, contact_address: "ул. Арбат 12" };
    const t = { pricing: false, faq: false, hours: false, contact: true };
    expect(countTriggerMatches(planEmail, t)).toBe(1);
    expect(countTriggerMatches(planAddr, t)).toBe(1);
  });

  it("whitespace-only поля не считаются заполненными", () => {
    const planWs: Plan = {
      ...basePlan,
      hours_text: "   ",
      contact_phone: "  ",
    };
    expect(
      countTriggerMatches(planWs, {
        pricing: false,
        faq: false,
        hours: true,
        contact: true,
      }),
    ).toBe(0);
  });
});

describe("applyExtendedTriggerBoost", () => {
  type Cand = { result: { plan?: Plan }; finalScore: number };
  const getPlan = (r: { plan?: Plan }) => r.plan;

  it("no-op когда триггеров нет", () => {
    const cands: Cand[] = [
      { result: { plan: { ...basePlan, pricing_tiers: pricingTiers } }, finalScore: 0.5 },
      { result: { plan: basePlan }, finalScore: 0.6 },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: false, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates).toEqual(cands);
    expect(r.boostedCount).toBe(0);
  });

  it("бустит matched кандидата и пересортировывает", () => {
    const cands: Cand[] = [
      { result: { plan: basePlan }, finalScore: 0.55 },
      {
        result: { plan: { ...basePlan, pricing_tiers: pricingTiers } },
        finalScore: 0.5,
      },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    // matched: 0.50 + 0.10 = 0.60 → выходит на первое место
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.6);
    expect(r.candidates[1]!.finalScore).toBeCloseTo(0.55);
    expect(r.boostedCount).toBe(1);
  });

  it("не бустит unmatched кандидатов", () => {
    const cands: Cand[] = [
      { result: { plan: basePlan }, finalScore: 0.7 },
      { result: { plan: basePlan }, finalScore: 0.6 },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.7);
    expect(r.candidates[1]!.finalScore).toBeCloseTo(0.6);
    expect(r.boostedCount).toBe(0);
  });

  it("суммирует boost при множественных совпадениях", () => {
    const planFull: Plan = {
      ...basePlan,
      pricing_tiers: pricingTiers,
      faq: faqItems,
    };
    const cands: Cand[] = [
      { result: { plan: basePlan }, finalScore: 0.7 },
      { result: { plan: planFull }, finalScore: 0.5 },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: true, hours: false, contact: false },
      getPlan,
    );
    // planFull: +0.10 * 2 матча = +0.20 → 0.70
    // sort stable — при равенстве 0.70 порядок сохраняется (baseline first)
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.7);
    expect(r.candidates[1]!.finalScore).toBeCloseTo(0.7);
    expect(r.boostedCount).toBe(1);
  });

  it("kill-switch ENABLED=0 отключает boost", () => {
    process.env.NIT_EXTENDED_TRIGGER_BOOST_ENABLED = "0";
    const cands: Cand[] = [
      {
        result: { plan: { ...basePlan, pricing_tiers: pricingTiers } },
        finalScore: 0.5,
      },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.5);
    expect(r.boostedCount).toBe(0);
  });

  it("кастомный AMOUNT через env", () => {
    process.env.NIT_EXTENDED_TRIGGER_BOOST_AMOUNT = "0.30";
    const cands: Cand[] = [
      {
        result: { plan: { ...basePlan, pricing_tiers: pricingTiers } },
        finalScore: 0.5,
      },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.8);
  });

  it("невалидный AMOUNT → fallback к 0.10", () => {
    process.env.NIT_EXTENDED_TRIGGER_BOOST_AMOUNT = "abc";
    const cands: Cand[] = [
      {
        result: { plan: { ...basePlan, pricing_tiers: pricingTiers } },
        finalScore: 0.5,
      },
    ];
    const r = applyExtendedTriggerBoost(
      cands,
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates[0]!.finalScore).toBeCloseTo(0.6);
  });

  it("пустой input → пустой output", () => {
    const r = applyExtendedTriggerBoost(
      [],
      { pricing: true, faq: false, hours: false, contact: false },
      getPlan,
    );
    expect(r.candidates).toEqual([]);
    expect(r.boostedCount).toBe(0);
  });
});
