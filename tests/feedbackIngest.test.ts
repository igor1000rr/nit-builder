import { describe, it, expect } from "vitest";
import { qualifies } from "~/lib/services/feedbackIngest";
import type { FeedbackRecord } from "~/lib/services/feedbackStore";
import type { Plan } from "~/lib/utils/planSchema";

const GOOD_PLAN: Plan = {
  business_type: "specialty-кофейня",
  target_audience: "офисные работники",
  tone: "тёплый",
  style_hints: "",
  color_mood: "warm-pastel",
  sections: ["hero", "menu"],
  keywords: ["кофе"],
  cta_primary: "Смотреть меню",
  language: "ru",
  suggested_template_id: "coffee-shop",
  hero_headline: "Кофе варят те, кто им живёт",
  hero_subheadline: "Обжариваем зерно из Колумбии каждую пятницу.",
  key_benefits: [
    { title: "Свежая обжарка", description: "Зерно в помол через 7 дней." },
    { title: "Бариста", description: "3 месяца стажировки перед сменой." },
    { title: "V60", description: "Альтернативные методы заварки." },
  ],
  social_proof_line: "500+ гостей",
  cta_microcopy: "Первая чашка бесплатно",
};

function makeRecord(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    ts: "2026-04-15T10:00:00.000Z",
    sessionId: "sess-1",
    mode: "create",
    outcome: "success",
    provider: "lmstudio",
    model: "qwen2.5-coder-7b",
    durationMs: 5000,
    userMessage: "открываю кофейню в центре города",
    plan: GOOD_PLAN,
    templateId: "coffee-shop",
    planCached: false,
    ...overrides,
  };
}

describe("qualifies", () => {
  it("хорошая запись проходит", () => {
    const r = qualifies(makeRecord());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toMatch(/^feedback:plan:[a-f0-9]{16}$/);
  });

  it("одинаковый query даёт одинаковый id (дедуп)", () => {
    const a = qualifies(makeRecord());
    const b = qualifies(makeRecord({ ts: "2026-04-16T10:00:00.000Z" }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.id).toBe(b.id);
  });

  it("polish режим отбрасывается", () => {
    const r = qualifies(makeRecord({ mode: "polish" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_create");
  });

  it("ошибки отбрасываются", () => {
    const r = qualifies(makeRecord({ outcome: "error" }));
    expect(r.ok).toBe(false);
  });

  it("errorReason любой → reject (truncated/continue_truncated/etc)", () => {
    const r = qualifies(makeRecord({ errorReason: "truncated" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("has_error_reason");
  });

  it("planCached отбрасывается (дубль)", () => {
    const r = qualifies(makeRecord({ planCached: true }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("plan_cached");
  });

  it("отсутствие plan или invalid schema", () => {
    const r = qualifies(makeRecord({ plan: undefined }));
    expect(r.ok).toBe(false);
  });

  it("короткий query отбрасывается", () => {
    const r = qualifies(makeRecord({ userMessage: "sait" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("query_too_short");
  });

  it("banned phrase в plan → reject", () => {
    const badPlan: Plan = {
      ...GOOD_PLAN,
      hero_headline: "Высочайшее качество кофе",
    };
    const r = qualifies(makeRecord({ plan: badPlan }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("banned_phrase");
  });

  it("план без числовых фактов в benefits → reject", () => {
    const noFacts: Plan = {
      ...GOOD_PLAN,
      key_benefits: [
        { title: "Хороший кофе", description: "Делаем ароматные напитки." },
        { title: "Уютная атмосфера", description: "Приятно работать." },
        { title: "Место", description: "Удобное расположение." },
      ],
    };
    const r = qualifies(makeRecord({ plan: noFacts }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_numeric_facts");
  });

  it("benefits меньше 3 → reject", () => {
    const tooFew: Plan = {
      ...GOOD_PLAN,
      key_benefits: [
        { title: "A", description: "Делаем 7 дней." },
        { title: "B", description: "3 месяца стажа." },
      ],
    };
    const r = qualifies(makeRecord({ plan: tooFew }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("benefits_count_invalid");
  });

  it("короткий hero → reject", () => {
    const r = qualifies(
      makeRecord({ plan: { ...GOOD_PLAN, hero_headline: "X" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("hero_invalid");
  });

  it("выброс по durationMs (>120s) → reject", () => {
    const r = qualifies(makeRecord({ durationMs: 200_000 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("duration_outlier");
  });
});
