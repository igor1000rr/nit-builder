import { describe, it, expect } from "vitest";
import { buildHtmlDigest, digestToPromptSnippet } from "~/lib/utils/htmlDigest";

const DARK_HTML = `<!DOCTYPE html><html><body class="bg-slate-900 text-white">
<section id="hero" data-nit-section="hero" class="bg-gradient-to-br from-purple-600 to-pink-500 text-white py-20">
  <h1 class="text-5xl font-bold">X</h1>
</section>
<section id="pricing" data-nit-section="pricing" class="bg-slate-800 text-slate-100 py-16">
  <h2>Y</h2>
</section>
<section id="contact" data-nit-section="contact" class="bg-slate-900 text-slate-400 py-12">
  <p>Z</p>
</section>
</body></html>`;

const LIGHT_HTML = `<!DOCTYPE html><html><body class="bg-white text-slate-900">
<section id="hero" data-nit-section="hero" class="bg-yellow-50 text-slate-900"><h1>X</h1></section>
<section id="contact" data-nit-section="contact" class="bg-gray-100"><p>Z</p></section>
</body></html>`;

describe("buildHtmlDigest", () => {
  it("извлекает body classes", () => {
    const d = buildHtmlDigest(DARK_HTML);
    expect(d.bodyClasses).toContain("bg-slate-900");
    expect(d.bodyClasses).toContain("text-white");
  });

  it("извлекает секции с визуальными классами", () => {
    const d = buildHtmlDigest(DARK_HTML);
    expect(d.sections.length).toBe(3);
    const hero = d.sections.find((s) => s.id === "hero");
    expect(hero?.rootClasses).toContain("bg-gradient-to-br");
    expect(hero?.rootClasses).toContain("from-purple-600");
    expect(hero?.rootClasses).toContain("to-pink-500");
    expect(hero?.rootClasses).toContain("text-white");
    expect(hero?.hasGradient).toBe(true);
  });

  it("отбрасывает layout-классы (padding, flex, breakpoints)", () => {
    const d = buildHtmlDigest(DARK_HTML);
    for (const s of d.sections) {
      expect(s.rootClasses).not.toContain("py-20");
      expect(s.rootClasses).not.toContain("py-16");
      expect(s.rootClasses).not.toContain("py-12");
    }
  });

  it("определяет dark theme", () => {
    expect(buildHtmlDigest(DARK_HTML).theme).toBe("dark");
  });

  it("определяет light theme", () => {
    expect(buildHtmlDigest(LIGHT_HTML).theme).toBe("light");
  });

  it("пустой html — пустой дайджест", () => {
    expect(buildHtmlDigest("")).toEqual({
      bodyClasses: [],
      sections: [],
      theme: "unknown",
    });
  });

  it("игнорирует section без data-nit-section", () => {
    const html = '<section class="bg-red-500">x</section>';
    expect(buildHtmlDigest(html).sections).toEqual([]);
  });
});

describe("digestToPromptSnippet", () => {
  it("сериализует body + секции в компактный текст", () => {
    const d = buildHtmlDigest(DARK_HTML);
    const snippet = digestToPromptSnippet(d);
    expect(snippet).toContain("body:");
    expect(snippet).toContain("hero:");
    expect(snippet).toContain("pricing:");
    expect(snippet).toContain("тёмная тема");
    expect(snippet.length).toBeLessThan(600);
  });

  it("помечает секции с градиентом", () => {
    const d = buildHtmlDigest(DARK_HTML);
    const snippet = digestToPromptSnippet(d);
    expect(snippet).toContain("[градиент]");
  });

  it("targetFilter ограничивает до указанных секций", () => {
    const d = buildHtmlDigest(DARK_HTML);
    const snippet = digestToPromptSnippet(d, ["hero"]);
    expect(snippet).toContain("hero:");
    expect(snippet).not.toContain("pricing:");
    expect(snippet).not.toContain("contact:");
  });

  it("пустой дайджест — пустая строка", () => {
    expect(digestToPromptSnippet({ bodyClasses: [], sections: [], theme: "unknown" })).toBe("");
  });
});
