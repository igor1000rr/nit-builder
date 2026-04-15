import { describe, it, expect } from "vitest";
import { pruneTemplateForPlan } from "~/lib/utils/templatePrune";

function makeSection(id: string, body = "content"): string {
  return `<!-- ═══ SECTION: ${id} ═══ -->
<section id="${id}" class="py-20">${body}</section>
<!-- ═══ END SECTION ═══ -->`;
}

function makeTemplate(ids: string[]): string {
  return `<!DOCTYPE html><html><head></head><body>
<nav>nav</nav>
${ids.map((id) => makeSection(id)).join("\n")}
<footer>footer</footer>
</body></html>`;
}

describe("pruneTemplateForPlan", () => {
  it("оставляет только секции из plan.sections", () => {
    const html = makeTemplate(["hero", "menu", "pricing", "contact"]);
    const r = pruneTemplateForPlan(html, ["hero", "contact"]);
    expect(r.kept).toEqual(["hero", "contact"]);
    expect(r.removed.sort()).toEqual(["menu", "pricing"]);
    expect(r.html).not.toContain('id="menu"');
    expect(r.html).not.toContain('id="pricing"');
    expect(r.html).toContain('id="hero"');
    expect(r.html).toContain('id="contact"');
  });

  it("сохраняет не-секционный код (head, nav, footer)", () => {
    const html = makeTemplate(["hero", "menu"]);
    const r = pruneTemplateForPlan(html, ["hero"]);
    expect(r.html).toContain("<!DOCTYPE html>");
    expect(r.html).toContain("<nav>nav</nav>");
    expect(r.html).toContain("<footer>footer</footer>");
  });

  it("первая секция (hero) всегда остаётся даже если не в plan", () => {
    const html = makeTemplate(["hero", "menu", "contact"]);
    const r = pruneTemplateForPlan(html, ["contact"]);
    expect(r.kept).toContain("hero");
    expect(r.kept).toContain("contact");
    expect(r.removed).toEqual(["menu"]);
  });

  it("безопасность: не prunит если бы осталось < 2 секций", () => {
    const html = makeTemplate(["hero", "menu", "contact"]);
    // wanted = [] + hero auto-keep → 1 section → no prune
    const r = pruneTemplateForPlan(html, ["nonexistent"]);
    expect(r.removed).toEqual([]);
    expect(r.html).toContain('id="menu"');
  });

  it("шаблон без маркеров — возвращает как есть", () => {
    const html = '<html><body><section id="hero">x</section></body></html>';
    const r = pruneTemplateForPlan(html, ["hero"]);
    expect(r.sectionsFound).toBe(0);
    expect(r.html).toBe(html);
  });

  it("пустой plan.sections — оставляет все секции", () => {
    const html = makeTemplate(["hero", "menu", "contact"]);
    const r = pruneTemplateForPlan(html, []);
    expect(r.removed).toEqual([]);
    expect(r.kept).toEqual(["hero", "menu", "contact"]);
  });

  it("case-insensitive matching", () => {
    const html = makeTemplate(["Hero", "MENU"]);
    const r = pruneTemplateForPlan(html, ["hero"]);
    expect(r.kept).toContain("hero");
  });

  it("экономия символов пропорциональна вырезанным секциям", () => {
    // 5 секций: hero auto-keep + "a" wanted → keep=2, remove=3 (b,c,d)
    // Safety-проверка пропускает (kept >= 2).
    const bigSection = (id: string) =>
      `<!-- ═══ SECTION: ${id} ═══ -->\n<section id="${id}">${"x".repeat(5000)}</section>\n<!-- ═══ END SECTION ═══ -->`;
    const html = `<html><body>${["hero", "a", "b", "c", "d"].map(bigSection).join("\n")}</body></html>`;
    const r = pruneTemplateForPlan(html, ["a"]);
    expect(r.removed.length).toBe(3);
    expect(r.removed.sort()).toEqual(["b", "c", "d"]);
    expect(html.length - r.html.length).toBeGreaterThan(14_000);
  });
});
