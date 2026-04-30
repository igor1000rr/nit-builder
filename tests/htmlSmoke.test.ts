import { describe, expect, it } from "vitest";
import { analyzeHtmlSmokeCase } from "~/lib/eval/htmlSmoke";

const BASE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head><title>Кофейня</title><style>.hero{}</style></head>
<body>
<section id="hero">
  <h1>Спешелти кофе каждый день</h1>
  <p>Обжарщик в зале и cupping-сессии.</p>
  <a href="#booking">Забронировать столик</a>
  <img src="https://example.com/coffee.jpg" alt="coffee">
</section>
<section id="menu"><h2>Меню</h2><p>Кофе, фильтр, десерты.</p></section>
<section id="contact"><p>+7 000 000</p></section>
</body></html>`;

describe("analyzeHtmlSmokeCase", () => {
  it("проходит для валидного HTML с релевантным hero CTA", () => {
    const result = analyzeHtmlSmokeCase({
      smokeCase: {
        id: "coffee",
        prompt: "кофейня",
        relevantAny: ["кофе", "cupping"],
        ctaAny: ["заброни", "столик"],
        expectedTemplateAny: ["coffee-shop"],
      },
      html: `${BASE_HTML}${" ".repeat(3000)}`,
      templateId: "coffee-shop",
      outputFile: "/tmp/coffee.html",
      durationMs: 10,
      events: {},
    });

    expect(result.passed).toBe(true);
    expect(result.checks.find((c) => c.name === "hero_cta_matches_intent")?.passed).toBe(true);
  });

  it("падает если hero CTA остался generic", () => {
    const html = BASE_HTML.replace("Забронировать столик", "Связаться");
    const result = analyzeHtmlSmokeCase({
      smokeCase: {
        id: "coffee",
        prompt: "кофейня",
        relevantAny: ["кофе"],
        ctaAny: ["заброни", "столик"],
      },
      html: `${html}${" ".repeat(3000)}`,
      templateId: "coffee-shop",
      outputFile: "/tmp/coffee.html",
      durationMs: 10,
      events: {},
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "hero_cta_matches_intent")?.passed).toBe(false);
  });

  it("добавляет visual warning если hero без изображения или SVG", () => {
    const html = BASE_HTML.replace(/<img[^>]+>/, "");
    const result = analyzeHtmlSmokeCase({
      smokeCase: {
        id: "coffee",
        prompt: "кофейня",
        relevantAny: ["кофе"],
        ctaAny: ["заброни"],
      },
      html: `${html}${" ".repeat(3000)}`,
      templateId: "coffee-shop",
      outputFile: "/tmp/coffee.html",
      durationMs: 10,
      events: {},
    });

    expect(result.warnings).toContain("hero has no obvious visual element");
  });
});
