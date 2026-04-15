import { describe, it, expect } from "vitest";
import {
  extractSection,
  replaceSection,
  extractSectionFromResponse,
  isSectionPolishEnabled,
} from "~/lib/services/sectionPolish";

const HTML_WITH_DATA_ATTR = `<!DOCTYPE html>
<html><head><title>x</title></head>
<body>
<section id="hero" data-nit-section="hero" class="py-20">
  <h1>Старый заголовок</h1>
  <p>Старый параграф</p>
</section>
<section id="benefits" data-nit-section="benefits">
  <h2>Преимущества</h2>
</section>
<section id="footer" data-nit-section="footer">
  <p>©</p>
</section>
</body></html>`;

const HTML_ID_ONLY = `<section id="hero" class="x"><h1>A</h1></section><section id="about"><p>B</p></section>`;

describe("extractSection", () => {
  it("находит секцию по data-nit-section", () => {
    const r = extractSection(HTML_WITH_DATA_ATTR, "hero");
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.matchedBy).toBe("data-nit-section");
      expect(r.sectionHtml).toContain("Старый заголовок");
      expect(r.sectionHtml).toMatch(/<\/section>$/);
      expect(r.before).toContain("<body>");
      expect(r.after).toContain("benefits");
    }
  });

  it("фолбэк на id если data-nit-section не проставлен", () => {
    const r = extractSection(HTML_ID_ONLY, "hero");
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.matchedBy).toBe("id");
      expect(r.sectionHtml).toContain("<h1>A</h1>");
    }
  });

  it("возвращает found:false для несуществующей секции", () => {
    const r = extractSection(HTML_WITH_DATA_ATTR, "contacts");
    expect(r.found).toBe(false);
  });

  it("находит правильную секцию когда несколько с data-nit-section", () => {
    const r = extractSection(HTML_WITH_DATA_ATTR, "benefits");
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.sectionHtml).toContain("Преимущества");
      expect(r.sectionHtml).not.toContain("Старый заголовок");
      expect(r.sectionHtml).not.toContain("©");
    }
  });

  it("экранирует sectionId от regex-injection", () => {
    const r = extractSection(HTML_WITH_DATA_ATTR, "hero[]()");
    // Спецсимволы стрипаются, остаётся "hero" — должен найти
    expect(r.found).toBe(true);
  });

  it("пустой sectionId не находит ничего", () => {
    const r = extractSection(HTML_WITH_DATA_ATTR, "");
    expect(r.found).toBe(false);
  });
});

describe("replaceSection", () => {
  it("заменяет секцию сохраняя остальной HTML", () => {
    const newSection = `<section id="hero" data-nit-section="hero" class="py-20"><h1>Новый</h1></section>`;
    const result = replaceSection(HTML_WITH_DATA_ATTR, "hero", newSection);
    expect(result).not.toBeNull();
    expect(result).toContain("<h1>Новый</h1>");
    expect(result).not.toContain("Старый заголовок");
    expect(result).toContain("Преимущества"); // соседняя секция нетронута
    expect(result).toContain("©"); // футер нетронут
  });

  it("возвращает null если секция не найдена", () => {
    const r = replaceSection(HTML_WITH_DATA_ATTR, "missing", "<section>x</section>");
    expect(r).toBeNull();
  });
});

describe("extractSectionFromResponse", () => {
  it("извлекает чистый <section>", () => {
    const raw = `<section id="hero"><h1>X</h1></section>`;
    expect(extractSectionFromResponse(raw)).toBe(raw);
  });

  it("стрипает обёртку ```html", () => {
    const raw = "```html\n<section id=\"hero\"><h1>X</h1></section>\n```";
    const r = extractSectionFromResponse(raw);
    expect(r).toBe(`<section id="hero"><h1>X</h1></section>`);
  });

  it("извлекает первый <section> игнорируя текст до и после", () => {
    const raw = `Вот обновлённая секция:\n<section id="hero"><h1>X</h1></section>\nГотово.`;
    expect(extractSectionFromResponse(raw)).toBe(
      `<section id="hero"><h1>X</h1></section>`,
    );
  });

  it("возвращает null если в ответе нет <section>", () => {
    expect(extractSectionFromResponse("<div>не секция</div>")).toBeNull();
    expect(extractSectionFromResponse("")).toBeNull();
  });
});

describe("isSectionPolishEnabled", () => {
  it("включено по умолчанию", () => {
    delete process.env.NIT_SECTION_POLISH_ENABLED;
    expect(isSectionPolishEnabled()).toBe(true);
  });

  it("выключено через NIT_SECTION_POLISH_ENABLED=0", () => {
    process.env.NIT_SECTION_POLISH_ENABLED = "0";
    expect(isSectionPolishEnabled()).toBe(false);
    delete process.env.NIT_SECTION_POLISH_ENABLED;
  });
});

describe("end-to-end: extract → replace round-trip", () => {
  it("извлечение и обратная подстановка не ломают HTML", () => {
    const ext = extractSection(HTML_WITH_DATA_ATTR, "hero");
    expect(ext.found).toBe(true);
    if (!ext.found) return;
    const restored = ext.before + ext.sectionHtml + ext.after;
    expect(restored).toBe(HTML_WITH_DATA_ATTR);
  });
});
