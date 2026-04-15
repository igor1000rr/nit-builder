import { describe, it, expect } from "vitest";
import { evaluatePlan, checkPassed, getCheckValue } from "~/lib/eval/metrics";
import type { Plan } from "~/lib/utils/planSchema";
import type { EvalQuery } from "~/lib/eval/types";

const GOOD_PLAN: Plan = {
  business_type: "specialty-кофейня",
  target_audience: "офисные работники",
  tone: "тёплый",
  style_hints: "",
  color_mood: "warm-pastel",
  sections: ["hero", "menu", "about"],
  keywords: ["кофе", "эспрессо"],
  cta_primary: "Смотреть меню",
  language: "ru",
  suggested_template_id: "coffee-shop",
  hero_headline: "Кофе варят те, кто им живёт",
  hero_subheadline: "Обжариваем зерно из Колумбии каждую пятницу.",
  key_benefits: [
    { title: "Свежая обжарка", description: "Зерно через 7 дней после обжарки." },
    { title: "Опытный бариста", description: "Каждый проходит 3 месяца стажировки." },
    { title: "V60 и кемекс", description: "Альтернативные методы заварки." },
  ],
  social_proof_line: "Более 500 гостей и 4.9 на Google Maps",
  cta_microcopy: "Первая чашка бесплатно",
};

const QUERY: EvalQuery = {
  id: "test-coffee",
  query: "кофейня",
  expectedNiche: "coffee-shop",
  mustHaveSections: ["hero", "menu"],
  expectedKeywordsAny: ["кофе"],
};

describe("evaluatePlan", () => {
  it("good plan проходит все ключевые чеки", () => {
    const checks = evaluatePlan(GOOD_PLAN, QUERY);
    expect(checkPassed(checks, "plan_schema_valid")).toBe(true);
    expect(checkPassed(checks, "hero_length_ok")).toBe(true);
    expect(checkPassed(checks, "benefits_count_ok")).toBe(true);
    expect(checkPassed(checks, "benefit_titles_ok")).toBe(true);
    expect(checkPassed(checks, "benefit_descriptions_ok")).toBe(true);
    expect(checkPassed(checks, "no_banned_phrases")).toBe(true);
    expect(checkPassed(checks, "benefits_have_numeric_facts")).toBe(true);
    expect(checkPassed(checks, "social_proof_has_number")).toBe(true);
    expect(checkPassed(checks, "microcopy_has_reassurance")).toBe(true);
    expect(checkPassed(checks, "must_have_sections")).toBe(true);
    expect(checkPassed(checks, "keywords_match_any")).toBe(true);
  });

  it("ловит banned phrases", () => {
    const bad: Plan = {
      ...GOOD_PLAN,
      key_benefits: [
        { title: "Качество", description: "Высочайший профессионализм во всём." },
        { title: "Опыт", description: "Многолетний опыт работы с клиентами." },
        { title: "Подход", description: "Индивидуальный подход к каждому." },
      ],
    };
    const checks = evaluatePlan(bad, QUERY);
    expect(checkPassed(checks, "no_banned_phrases")).toBe(false);
    const value = getCheckValue(checks, "no_banned_phrases");
    expect(value).toBeGreaterThan(0);
  });

  it("ловит отсутствие числовых фактов в benefits", () => {
    const noFacts: Plan = {
      ...GOOD_PLAN,
      key_benefits: [
        { title: "Качественный кофе", description: "Делаем ароматные напитки." },
        { title: "Уютная атмосфера", description: "Приятная обстановка для работы." },
        { title: "Хорошее место", description: "Удобное расположение." },
      ],
    };
    const checks = evaluatePlan(noFacts, QUERY);
    expect(checkPassed(checks, "benefits_have_numeric_facts")).toBe(false);
  });

  it("ловит отсутствие числа в social proof", () => {
    const noProofNumber: Plan = {
      ...GOOD_PLAN,
      social_proof_line: "Любимое место горожан",
    };
    const checks = evaluatePlan(noProofNumber, QUERY);
    expect(checkPassed(checks, "social_proof_has_number")).toBe(false);
  });

  it("ловит microcopy без снятия трений", () => {
    const noReassurance: Plan = {
      ...GOOD_PLAN,
      cta_microcopy: "Заходите",
    };
    const checks = evaluatePlan(noReassurance, QUERY);
    expect(checkPassed(checks, "microcopy_has_reassurance")).toBe(false);
  });

  it("ловит missing must-have sections", () => {
    const noSections: Plan = { ...GOOD_PLAN, sections: ["hero"] };
    const checks = evaluatePlan(noSections, QUERY);
    expect(checkPassed(checks, "must_have_sections")).toBe(false);
  });

  it("ловит несовпадение template когда expectedTemplateId задан", () => {
    const queryWithTemplate: EvalQuery = {
      ...QUERY,
      expectedTemplateId: "coffee-shop",
    };
    const wrongTemplate: Plan = { ...GOOD_PLAN, suggested_template_id: "blank-landing" };
    const checks = evaluatePlan(wrongTemplate, queryWithTemplate);
    expect(checkPassed(checks, "template_match")).toBe(false);
  });

  it("keywords_match_any: подстрочное совпадение работает в обе стороны", () => {
    const planWithKeyword: Plan = {
      ...GOOD_PLAN,
      keywords: ["кофейня третьей волны"],
    };
    const checks = evaluatePlan(planWithKeyword, QUERY);
    expect(checkPassed(checks, "keywords_match_any")).toBe(true);
  });
});
