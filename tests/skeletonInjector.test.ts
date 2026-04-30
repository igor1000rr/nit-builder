import { describe, it, expect, beforeEach } from "vitest";
import { injectPlanIntoTemplate } from "~/lib/services/skeletonInjector";
import type { Plan } from "~/lib/utils/planSchema";

const BASE_TEMPLATE = `<!DOCTYPE html>
<html><head><title>Default title</title></head><body>
<section id="hero">
  <h1>Default headline</h1>
  <p>Default subheadline text.</p>
  <a href="#">CTA</a>
</section>
<section id="features">
  <h2>Features title</h2>
  <div class="grid">
    <div class="card">
      <h3>Default benefit 1</h3>
      <p>Default description 1.</p>
    </div>
    <div class="card">
      <h3>Default benefit 2</h3>
      <p>Default description 2.</p>
    </div>
    <div class="card">
      <h3>Default benefit 3</h3>
      <p>Default description 3.</p>
    </div>
  </div>
</section>
<section id="testimonials">
  <p>Default social proof line.</p>
</section>
</body></html>`;

const FULL_PLAN: Plan = {
  business_type: "кофейня",
  target_audience: "офисные",
  tone: "тёплый",
  style_hints: "",
  color_mood: "warm-pastel",
  sections: ["hero", "features"],
  keywords: [],
  cta_primary: "Смотреть",
  language: "ru",
  suggested_template_id: "coffee-shop",
  hero_headline: "Кофе варят те, кто им живёт",
  hero_subheadline: "Обжарка каждую пятницу из Колумбии.",
  key_benefits: [
    { title: "Свежесть", description: "Зерно в помол через 7 дней." },
    { title: "Бариста", description: "3 месяца стажировки." },
    { title: "V60", description: "Альтернативные методы." },
  ],
  social_proof_line: "500+ гостей",
  cta_microcopy: "Первая чашка бесплатно",
};

beforeEach(() => {
  delete process.env.NIT_SKELETON_INJECT_ENABLED;
});

describe("injectPlanIntoTemplate", () => {
  it("подставляет hero_headline в h1 секции hero", () => {
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, FULL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("Кофе варят те, кто им живёт");
      expect(r.html).not.toContain("Default headline");
    }
  });

  it("подставляет hero_subheadline в первый p после h1", () => {
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, FULL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("Обжарка каждую пятницу");
      expect(r.html).not.toContain("Default subheadline");
    }
  });

  it("подставляет cta_primary в первую hero-кнопку", () => {
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, {
      ...FULL_PLAN,
      cta_primary: "Забронировать столик",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain(">Забронировать столик</a>");
      expect(r.html).not.toContain(">CTA</a>");
    }
  });

  it("подставляет все 3 benefits в features-секцию", () => {
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, FULL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("Свежесть");
      expect(r.html).toContain("Зерно в помол через 7 дней");
      expect(r.html).toContain("V60");
      expect(r.html).toContain("Альтернативные методы");
      expect(r.html).not.toContain("Default benefit 1");
    }
  });

  it("экранирует HTML-спецсимволы в копирайте", () => {
    const planWithHtml: Plan = {
      ...FULL_PLAN,
      hero_headline: "Кафе <b>premium</b> & co",
    };
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, planWithHtml);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("&lt;b&gt;premium&lt;/b&gt;");
      expect(r.html).toContain("&amp;");
    }
  });

  it("возвращает ok:false без hero_headline (legacy plan)", () => {
    const legacyPlan: Plan = { ...FULL_PLAN, hero_headline: undefined };
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, legacyPlan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing_required/);
  });

  it("отключается через ENV", () => {
    process.env.NIT_SKELETON_INJECT_ENABLED = "0";
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, FULL_PLAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disabled");
  });

  it("возвращает low_fill_ratio если шаблон без hero/features", () => {
    const minimalTemplate = `<html><body><section id="contact"><h1>X</h1></section></body></html>`;
    const r = injectPlanIntoTemplate(minimalTemplate, FULL_PLAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/low_fill_ratio/);
    }
  });

  it("fallback на about если features/benefits отсутствуют", () => {
    // Шаблон должен содержать достаточно слотов для прохождения SLOT_FILL_THRESHOLD=0.6:
    // title + h1 + p + benefits(about) + social_proof + cta_microcopy = 6/6
    const aboutTemplate = `<html><head><title>X</title></head><body>
      <section id="hero"><h1>X</h1><p>Y</p><a href="#">CTA</a></section>
      <section id="about">
        <h3>Card 1</h3><p>Desc 1</p>
        <h3>Card 2</h3><p>Desc 2</p>
        <h3>Card 3</h3><p>Desc 3</p>
      </section>
      <section id="testimonials"><p>Old</p></section>
    </body></html>`;
    const r = injectPlanIntoTemplate(aboutTemplate, FULL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("Свежесть");
      expect(r.html).not.toContain("Card 1");
    }
  });

  it("не рвёт структуру HTML", () => {
    const r = injectPlanIntoTemplate(BASE_TEMPLATE, FULL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Проверяем что все тэги остались закрытыми
      const openH1 = (r.html.match(/<h1\b/g) ?? []).length;
      const closeH1 = (r.html.match(/<\/h1>/g) ?? []).length;
      expect(openH1).toBe(closeH1);
      const openSection = (r.html.match(/<section\b/g) ?? []).length;
      const closeSection = (r.html.match(/<\/section>/g) ?? []).length;
      expect(openSection).toBe(closeSection);
    }
  });
});
