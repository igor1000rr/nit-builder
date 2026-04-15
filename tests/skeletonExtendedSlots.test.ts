import { describe, it, expect } from "vitest";
import { injectPlanIntoTemplate } from "~/lib/services/skeletonInjector";
import type { Plan } from "~/lib/utils/planSchema";

const BASE_PLAN: Plan = {
  business_type: "онлайн-школа дизайна",
  target_audience: "начинающие дизайнеры",
  tone: "дружелюбный",
  style_hints: "",
  color_mood: "light-minimal",
  sections: ["hero", "benefits", "pricing", "faq", "contact"],
  keywords: ["дизайн", "figma", "курс"],
  cta_primary: "Записаться",
  language: "ru",
  suggested_template_id: "online-school",
  hero_headline: "Стань дизайнером за 6 месяцев",
  hero_subheadline: "Обучение с трудоустройством в команды яндекса и озона.",
  key_benefits: [
    { title: "Практика", description: "15 реальных проектов в портфолио." },
    { title: "Ментор", description: "Личный куратор из отрасли." },
    { title: "Гарантия", description: "Работа за 30 дней или возврат." },
  ],
  social_proof_line: "500+ выпускников работают в IT",
  cta_microcopy: "Первый урок бесплатно",
};

const CORE_HTML = `<!DOCTYPE html><html><head><title>old</title></head><body>
<section id="hero"><h1>old</h1><p>old sub</p><a href="#">Start</a></section>
<section id="benefits"><h3>old1</h3><p>old1d</p><h3>old2</h3><p>old2d</p><h3>old3</h3><p>old3d</p></section>
<section id="testimonials"><p>old proof</p></section>
</body></html>`;

describe("skeletonInjector: extended slots opt-in behavior", () => {
  it("план без extended-полей — extendedSlotsFilled=0", () => {
    const r = injectPlanIntoTemplate(CORE_HTML, BASE_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extendedSlotsFilled).toBe(0);
  });

  it("plan с pricing_tiers + шаблон БЕЗ #pricing — тихо пропуск, fillRatio не изменён", () => {
    const planWithPricing: Plan = {
      ...BASE_PLAN,
      pricing_tiers: [
        { name: "Старт", price: "₽9 990", features: ["Доступ к курсу"] },
        { name: "Pro", price: "₽29 990", features: ["Ментор", "Гарантия"], highlighted: true },
      ],
    };
    const r = injectPlanIntoTemplate(CORE_HTML, planWithPricing);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(0); // шаблон без #pricing — пропуск
      expect(r.fillRatio).toBeGreaterThanOrEqual(0.8); // core slots все заполнены
    }
  });
});

describe("skeletonInjector: pricing_tiers replacer", () => {
  const PRICING_HTML = `<!DOCTYPE html><html><head><title>x</title></head><body>
<section id="hero"><h1>old</h1><p>old</p><a>cta</a></section>
<section id="benefits"><h3>b1</h3><p>d1</p><h3>b2</h3><p>d2</p><h3>b3</h3><p>d3</p></section>
<section id="pricing">
  <h3>old tier 1</h3><span class="price">old1</span><ul><li>old feature 1</li></ul>
  <h3>old tier 2</h3><span class="price">old2</span><ul><li>old feature 2</li></ul>
</section>
</body></html>`;

  it("заменяет name+price+features в карточках тарифов", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      pricing_tiers: [
        { name: "Старт", price: "₽9 990", period: "разово", features: ["Основы", "4 модуля"] },
        { name: "Pro", price: "₽29 990", features: ["Всё из Старт", "Ментор", "Сертификат"], highlighted: true },
      ],
    };
    const r = injectPlanIntoTemplate(PRICING_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(1);
      expect(r.html).toContain("Старт");
      expect(r.html).toContain("Pro");
      expect(r.html).toContain("₽9 990");
      expect(r.html).toContain("₽29 990");
      expect(r.html).toContain("Основы");
      expect(r.html).toContain("Ментор");
      expect(r.html).not.toContain("old tier 1");
      expect(r.html).not.toContain("old feature 1");
    }
  });
});

describe("skeletonInjector: faq replacer (h3+p strategy)", () => {
  const FAQ_HTML = `<!DOCTYPE html><html><head><title>x</title></head><body>
<section id="hero"><h1>old</h1><p>old</p><a>cta</a></section>
<section id="benefits"><h3>b1</h3><p>d1</p><h3>b2</h3><p>d2</p><h3>b3</h3><p>d3</p></section>
<section id="faq">
  <h3>old q1?</h3><p>old a1</p>
  <h3>old q2?</h3><p>old a2</p>
  <h3>old q3?</h3><p>old a3</p>
</section>
</body></html>`;

  it("заменяет вопросы и ответы в #faq", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      faq: [
        { question: "Сколько длится обучение?", answer: "6 месяцев, 3 раза в неделю." },
        { question: "Есть ли рассрочка?", answer: "Да, от 3 до 12 месяцев." },
        { question: "Какая гарантия?", answer: "Возврат в течение 14 дней." },
      ],
    };
    const r = injectPlanIntoTemplate(FAQ_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(1);
      expect(r.html).toContain("Сколько длится");
      expect(r.html).toContain("6 месяцев, 3 раза");
      expect(r.html).toContain("рассрочка");
      expect(r.html).not.toContain("old q1");
      expect(r.html).not.toContain("old a1");
    }
  });
});

describe("skeletonInjector: hours_text replacer", () => {
  const HOURS_HTML = `<!DOCTYPE html><html><head><title>x</title></head><body>
<section id="hero"><h1>old</h1><p>old</p><a>cta</a></section>
<section id="benefits"><h3>b1</h3><p>d1</p><h3>b2</h3><p>d2</p><h3>b3</h3><p>d3</p></section>
<section id="hours"><span class="hours">old hours</span></section>
</body></html>`;

  it("заменяет текст часов в #hours", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      hours_text: "Пн-Пт 9:00-22:00, Сб-Вс 10:00-20:00",
    };
    const r = injectPlanIntoTemplate(HOURS_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(1);
      expect(r.html).toContain("Пн-Пт 9:00-22:00");
      expect(r.html).not.toContain("old hours");
    }
  });
});

describe("skeletonInjector: contact info replacer", () => {
  const CONTACT_HTML = `<!DOCTYPE html><html><head><title>x</title></head><body>
<section id="hero"><h1>old</h1><p>old</p><a>cta</a></section>
<section id="benefits"><h3>b1</h3><p>d1</p><h3>b2</h3><p>d2</p><h3>b3</h3><p>d3</p></section>
<section id="contact">
  <a href="tel:+70000000000">old phone</a>
  <a href="mailto:old@example.com">old@example.com</a>
  <address>old address</address>
</section>
</body></html>`;

  it("заменяет phone, email, address в #contact", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      contact_phone: "+7 (495) 123-45-67",
      contact_email: "hello@school.ru",
      contact_address: "Москва, ул. Арбат 12",
    };
    const r = injectPlanIntoTemplate(CONTACT_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(1);
      expect(r.html).toContain("tel:+74951234567"); // очищенные цифры
      expect(r.html).toContain("+7 (495) 123-45-67");
      expect(r.html).toContain("mailto:hello@school.ru");
      expect(r.html).toContain("Москва, ул. Арбат 12");
      expect(r.html).not.toContain("old phone");
      expect(r.html).not.toContain("old@example.com");
      expect(r.html).not.toContain("old address");
    }
  });

  it("частичный contact (только phone) — заменяет только присутствующее", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      contact_phone: "+7 (812) 999-99-99",
    };
    const r = injectPlanIntoTemplate(CONTACT_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(1);
      expect(r.html).toContain("+7 (812) 999-99-99");
      expect(r.html).toContain("old@example.com"); // email не тронут
      expect(r.html).toContain("old address"); // address не тронут
    }
  });
});

describe("skeletonInjector: multiple extended slots in one template", () => {
  const FULL_HTML = `<!DOCTYPE html><html><head><title>x</title></head><body>
<section id="hero"><h1>old</h1><p>old</p><a>cta</a></section>
<section id="benefits"><h3>b1</h3><p>d1</p><h3>b2</h3><p>d2</p><h3>b3</h3><p>d3</p></section>
<section id="pricing">
  <h3>old1</h3><span class="price">old1</span><ul><li>x</li></ul>
  <h3>old2</h3><span class="price">old2</span><ul><li>x</li></ul>
</section>
<section id="faq">
  <h3>old q1</h3><p>old a1</p>
  <h3>old q2</h3><p>old a2</p>
  <h3>old q3</h3><p>old a3</p>
</section>
<section id="hours"><span class="hours">old</span></section>
<section id="contact"><a href="tel:1">old</a></section>
</body></html>`;

  it("extendedSlotsFilled=4 когда все 4 расширенных поля заполнены", () => {
    const plan: Plan = {
      ...BASE_PLAN,
      pricing_tiers: [
        { name: "A", price: "$1", features: ["x"] },
        { name: "B", price: "$2", features: ["y"] },
      ],
      faq: [
        { question: "q1?", answer: "a1" },
        { question: "q2?", answer: "a2" },
        { question: "q3?", answer: "a3" },
      ],
      hours_text: "24/7",
      contact_phone: "+1 555 0100",
    };
    const r = injectPlanIntoTemplate(FULL_HTML, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extendedSlotsFilled).toBe(4);
    }
  });
});
