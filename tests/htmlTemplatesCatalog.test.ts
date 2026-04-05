import { describe, it, expect } from "vitest";
import {
  TEMPLATE_CATALOG,
  getTemplateById,
  getFallbackTemplate,
  buildCatalogForPrompt,
} from "~/lib/config/htmlTemplatesCatalog";
import { loadTemplateHtml, loadTemplateHtmlForLlm } from "~/lib/config/htmlTemplates.server";

describe("htmlTemplatesCatalog", () => {
  it("contains exactly 16 templates", () => {
    expect(TEMPLATE_CATALOG).toHaveLength(16);
  });

  it("all templates have unique ids", () => {
    const ids = TEMPLATE_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes blank-landing fallback", () => {
    const fallback = TEMPLATE_CATALOG.find((t) => t.id === "blank-landing");
    expect(fallback).toBeDefined();
    expect(fallback?.category).toBe("generic");
  });

  it("getFallbackTemplate returns blank-landing", () => {
    expect(getFallbackTemplate().id).toBe("blank-landing");
  });

  it("getTemplateById returns correct template", () => {
    const coffee = getTemplateById("coffee-shop");
    expect(coffee).toBeDefined();
    expect(coffee?.name).toContain("Кофейня");
  });

  it("getTemplateById returns null for unknown id", () => {
    expect(getTemplateById("nonexistent-template-xyz")).toBeNull();
  });

  it("all templates have required metadata fields", () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.bestFor.length).toBeGreaterThan(0);
      expect(t.sections.length).toBeGreaterThan(0);
      expect(t.emoji).toBeTruthy();
    }
  });

  it("buildCatalogForPrompt includes all templates", () => {
    const prompt = buildCatalogForPrompt();
    for (const t of TEMPLATE_CATALOG) {
      expect(prompt).toContain(t.id);
      expect(prompt).toContain(t.name);
    }
  });

  it("all category values are valid enum members", () => {
    const valid = new Set([
      "food", "beauty", "creative", "service", "event",
      "business", "personal", "generic",
    ]);
    for (const t of TEMPLATE_CATALOG) {
      expect(valid.has(t.category)).toBe(true);
    }
  });
});

describe("loadTemplateHtml (server)", () => {
  it("loads coffee-shop.html", () => {
    const html = loadTemplateHtml("coffee-shop");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("tailwindcss");
  });

  it("loads blank-landing.html", () => {
    const html = loadTemplateHtml("blank-landing");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("falls back to blank-landing for unknown id", () => {
    const html = loadTemplateHtml("totally-fake-template-id");
    expect(html).toContain("<!DOCTYPE html>");
    // Fallback should still be valid HTML
    expect(html).toContain("</html>");
  });

  it("all 16 catalog templates have corresponding HTML files", () => {
    for (const t of TEMPLATE_CATALOG) {
      const html = loadTemplateHtml(t.id);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html.length).toBeGreaterThan(1000);
    }
  });

  it("caches loaded templates (same object returned on subsequent calls)", () => {
    const first = loadTemplateHtml("coffee-shop");
    const second = loadTemplateHtml("coffee-shop");
    expect(first).toBe(second);
  });
});

describe("loadTemplateHtmlForLlm (annotated)", () => {
  it("adds section markers around <section id> blocks", () => {
    const annotated = loadTemplateHtmlForLlm("coffee-shop");
    expect(annotated).toContain("SECTION: hero");
    expect(annotated).toContain("END SECTION");
  });

  it("preserves original HTML structure", () => {
    const annotated = loadTemplateHtmlForLlm("coffee-shop");
    expect(annotated).toContain("<!DOCTYPE html>");
    expect(annotated).toContain("</html>");
    expect(annotated).toContain("tailwindcss");
  });

  it("annotated version is larger than raw (due to markers)", () => {
    const raw = loadTemplateHtml("coffee-shop");
    const annotated = loadTemplateHtmlForLlm("coffee-shop");
    expect(annotated.length).toBeGreaterThan(raw.length);
  });

  it("marker count matches section count", () => {
    const raw = loadTemplateHtml("coffee-shop");
    const sectionCount = (raw.match(/<section\s+id="/g) ?? []).length;
    const annotated = loadTemplateHtmlForLlm("coffee-shop");
    const markerCount = (annotated.match(/SECTION:/g) ?? []).length;
    expect(markerCount).toBe(sectionCount);
  });

  it("caches annotated results independently", () => {
    const first = loadTemplateHtmlForLlm("blank-landing");
    const second = loadTemplateHtmlForLlm("blank-landing");
    expect(first).toBe(second);
  });
});
