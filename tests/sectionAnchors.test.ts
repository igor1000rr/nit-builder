import { describe, it, expect } from "vitest";
import { enrichSectionAnchors } from "~/lib/utils/sectionAnchors";

describe("enrichSectionAnchors", () => {
  it("добавляет data-nit-section на <section id>", () => {
    const html = '<section id="hero" class="py-20">x</section>';
    const out = enrichSectionAnchors(html);
    expect(out).toContain('data-nit-section="hero"');
    expect(out).toContain('id="hero"');
    expect(out).toContain("class=\"py-20\"");
  });

  it("обрабатывает несколько секций", () => {
    const html = `<section id="hero">a</section><section id="menu">b</section>`;
    const out = enrichSectionAnchors(html);
    expect(out).toContain('data-nit-section="hero"');
    expect(out).toContain('data-nit-section="menu"');
  });

  it("idempotent: повторный вызов не дублирует атрибут", () => {
    const html = '<section id="hero">x</section>';
    const once = enrichSectionAnchors(html);
    const twice = enrichSectionAnchors(once);
    expect(twice).toBe(once);
    expect((twice.match(/data-nit-section/g) ?? []).length).toBe(1);
  });

  it("пропускает <section> без id", () => {
    const html = "<section class=\"foo\">x</section>";
    const out = enrichSectionAnchors(html);
    expect(out).not.toContain("data-nit-section");
  });

  it("не трогает div/article с id", () => {
    const html = '<div id="hero">x</div><article id="y">z</article>';
    expect(enrichSectionAnchors(html)).toBe(html);
  });

  it("пустая строка / хтмл без секций — возвращает как есть", () => {
    expect(enrichSectionAnchors("")).toBe("");
    expect(enrichSectionAnchors("<div>x</div>")).toBe("<div>x</div>");
  });

  it("поддерживает одинарные кавычки в id", () => {
    const html = "<section id='hero'>x</section>";
    expect(enrichSectionAnchors(html)).toContain('data-nit-section="hero"');
  });

  it("работает в полном HTML-документе", () => {
    const html = `<!DOCTYPE html><html><body>
<section id="hero" class="py-20"><h1>X</h1></section>
<section id="contact"><p>Y</p></section>
</body></html>`;
    const out = enrichSectionAnchors(html);
    expect(out).toContain('data-nit-section="hero"');
    expect(out).toContain('data-nit-section="contact"');
    expect(out).toContain("<!DOCTYPE html>");
  });
});
