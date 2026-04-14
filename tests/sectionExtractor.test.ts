import { describe, it, expect } from "vitest";
import {
  extractSections,
  findSection,
  listSectionIds,
  replaceSection,
} from "~/lib/utils/sectionExtractor";

const SAMPLE_HTML = `<!DOCTYPE html><html><body>
<section id="hero" data-nit-section="hero" class="py-20">
  <h1>Welcome</h1>
</section>
<section id="menu" data-nit-section="menu">
  <ul><li>Item</li></ul>
</section>
<section id="contact" data-nit-section="contact"><p>mail@me</p></section>
</body></html>`;

describe("extractSections", () => {
  it("находит все помеченные секции", () => {
    const sections = extractSections(SAMPLE_HTML);
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.id)).toEqual(["hero", "menu", "contact"]);
  });

  it("включает полный <section>...</section> HTML", () => {
    const sections = extractSections(SAMPLE_HTML);
    expect(sections[0]!.html).toMatch(/^<section\b/);
    expect(sections[0]!.html).toMatch(/<\/section>$/);
    expect(sections[0]!.html).toContain("Welcome");
  });

  it("startIdx/endIdx дают корректный slice", () => {
    const [first] = extractSections(SAMPLE_HTML);
    expect(SAMPLE_HTML.slice(first!.startIdx, first!.endIdx)).toBe(first!.html);
  });

  it("игнорирует <section> без data-nit-section", () => {
    const html = `<section id="x">no marker</section>${SAMPLE_HTML}`;
    expect(extractSections(html)).toHaveLength(3);
  });

  it("пустой HTML → пустой массив", () => {
    expect(extractSections("")).toEqual([]);
    expect(extractSections("<div>no sections</div>")).toEqual([]);
  });
});

describe("listSectionIds", () => {
  it("возвращает id в порядке появления", () => {
    expect(listSectionIds(SAMPLE_HTML)).toEqual(["hero", "menu", "contact"]);
  });
});

describe("findSection", () => {
  it("находит по id", () => {
    const s = findSection(SAMPLE_HTML, "menu");
    expect(s).not.toBeNull();
    expect(s!.id).toBe("menu");
    expect(s!.html).toContain("Item");
  });

  it("null для несуществующего id", () => {
    expect(findSection(SAMPLE_HTML, "nonexistent")).toBeNull();
  });
});

describe("replaceSection", () => {
  it("заменяет секцию по id", () => {
    const newHero = '<section data-nit-section="hero"><h1>NEW</h1></section>';
    const out = replaceSection(SAMPLE_HTML, "hero", newHero);
    expect(out).toContain("<h1>NEW</h1>");
    expect(out).not.toContain("Welcome");
    // Соседние секции целы
    expect(out).toContain("Item");
    expect(out).toContain("mail@me");
  });

  it("возвращает html без изменений для несуществующего id", () => {
    expect(replaceSection(SAMPLE_HTML, "zzz", "<section></section>")).toBe(SAMPLE_HTML);
  });

  it("после замены новая секция снова находится через findSection", () => {
    const newHero = '<section data-nit-section="hero"><h1>NEW</h1></section>';
    const out = replaceSection(SAMPLE_HTML, "hero", newHero);
    const found = findSection(out, "hero");
    expect(found).not.toBeNull();
    expect(found!.html).toContain("NEW");
  });
});
