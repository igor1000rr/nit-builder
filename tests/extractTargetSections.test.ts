import { describe, it, expect } from "vitest";
import { extractTargetSections, classifyPolishIntent } from "~/lib/services/intentClassifier";

describe("extractTargetSections", () => {
  it("распознаёт hero по разным синонимам", () => {
    expect(extractTargetSections("сделай hero синим")).toContain("hero");
    expect(extractTargetSections("в героe поменяй цвет")).toContain("hero");
    expect(extractTargetSections("первый экран сделай тёмным")).toContain("hero");
    expect(extractTargetSections("шапку в синий")).toContain("hero");
  });

  it("распознаёт pricing", () => {
    expect(extractTargetSections("сделай прайс жёлтым")).toContain("pricing");
    expect(extractTargetSections("подсвети цены")).toContain("pricing");
    expect(extractTargetSections("в тарифах увеличь шрифт")).toContain("pricing");
  });

  it("распознаёт contact и footer как отдельные секции", () => {
    expect(extractTargetSections("футер сделай темнее")).toContain("footer");
    expect(extractTargetSections("в контактах поменяй фон")).toContain("contact");
    expect(extractTargetSections("подвал тёмный")).toContain("footer");
  });

  it("распознаёт testimonials", () => {
    expect(extractTargetSections("в отзывах увеличь шрифт")).toContain("testimonials");
  });

  it("возвращает несколько секций если упомянуты обе", () => {
    const result = extractTargetSections("hero и pricing сделай синими");
    expect(result).toContain("hero");
    expect(result).toContain("pricing");
  });

  it("дедуплицирует при повторных упоминаниях", () => {
    const result = extractTargetSections("hero и герой и первый экран");
    expect(result.filter((s) => s === "hero")).toHaveLength(1);
  });

  it("пустой массив если секции не упомянуты", () => {
    expect(extractTargetSections("сделай всё синим")).toEqual([]);
    expect(extractTargetSections("в тёмную тему")).toEqual([]);
  });

  it("пустая строка — пустой массив", () => {
    expect(extractTargetSections("")).toEqual([]);
    expect(extractTargetSections("   ")).toEqual([]);
  });

  it("не ложноcрабатывает на case", () => {
    // слово содержит 'hero' как подстроку — должно работать только на word boundary
    expect(extractTargetSections("heroes академия")).toEqual([]);
  });
});

describe("classifyPolishIntent с target sections", () => {
  it("css_patch с hero → targetSections содержит hero", () => {
    const c = classifyPolishIntent("сделай hero синим");
    expect(c.intent).toBe("css_patch");
    expect(c.targetSections).toContain("hero");
    expect(c.reason).toContain("scoped");
  });

  it("глобальная style-правка → пустой targetSections", () => {
    const c = classifyPolishIntent("сделай всё синим");
    expect(c.intent).toBe("css_patch");
    expect(c.targetSections).toEqual([]);
  });

  it("structural + упоминание секции → full_rewrite но targetSections сохраняются", () => {
    const c = classifyPolishIntent("добавь секцию отзывы");
    expect(c.intent).toBe("full_rewrite");
    expect(c.targetSections).toContain("testimonials");
  });
});
