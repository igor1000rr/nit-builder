import { describe, it, expect } from "vitest";
import {
  rulesToCss,
  injectCssOverrides,
  scopeSelector,
  CssPatchSchema,
} from "~/lib/services/cssPatch";

describe("rulesToCss", () => {
  it("сериализует одно правило с !important", () => {
    const css = rulesToCss([
      { selector: "body", properties: { background: "#1e3a8a", color: "#f8fafc" } },
    ]);
    expect(css).toContain("body {");
    expect(css).toContain("background: #1e3a8a !important;");
    expect(css).toContain("color: #f8fafc !important;");
  });

  it("сериализует несколько правил", () => {
    const css = rulesToCss([
      { selector: "h1", properties: { color: "red" } },
      { selector: "button", properties: { "border-radius": "9999px" } },
    ]);
    expect(css).toMatch(/h1 \{[\s\S]*\}\n\nbutton \{/);
  });

  it("не дублирует !important", () => {
    const css = rulesToCss([
      { selector: "a", properties: { color: "blue !important" } },
    ]);
    expect(css).toContain("color: blue !important;");
    expect(css).not.toContain("!important !important");
  });
});

describe("scopeSelector", () => {
  it("body → сам scope", () => {
    expect(scopeSelector("body", "hero")).toBe('[data-nit-section="hero"]');
  });

  it("body.foo → scope.foo", () => {
    expect(scopeSelector("body.foo", "hero")).toBe('[data-nit-section="hero"].foo');
  });

  it("простой тег → scope + тег", () => {
    expect(scopeSelector("h1", "hero")).toBe('[data-nit-section="hero"] h1');
  });

  it("класс → scope + класс", () => {
    expect(scopeSelector(".btn", "pricing")).toBe('[data-nit-section="pricing"] .btn');
  });

  it("множественный через запятую — каждый скоупится отдельно", () => {
    const out = scopeSelector("h1, .btn, button", "hero");
    expect(out).toContain('[data-nit-section="hero"] h1');
    expect(out).toContain('[data-nit-section="hero"] .btn');
    expect(out).toContain('[data-nit-section="hero"] button');
  });

  it("html не скоупится", () => {
    expect(scopeSelector("html", "hero")).toBe("html");
  });

  it("idempotent: уже скоупленный селектор не скоупится второй раз", () => {
    const already = '[data-nit-section="hero"] h1';
    expect(scopeSelector(already, "hero")).toBe(already);
  });

  it("пустые части отбрасываются", () => {
    expect(scopeSelector("h1, , button", "hero")).toBe(
      '[data-nit-section="hero"] h1, [data-nit-section="hero"] button',
    );
  });
});

describe("injectCssOverrides", () => {
  it("вставляет новый блок перед </head>", () => {
    const html = "<!DOCTYPE html><html><head><title>X</title></head><body></body></html>";
    const out = injectCssOverrides(html, "body{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
    expect(out).toContain("body{color:red}");
  });

  it("дополняет существующий блок", () => {
    const html = `<html><head>
<style id="nit-overrides">
body { background: red !important; }
</style>
</head><body></body></html>`;
    const out = injectCssOverrides(html, "button { border-radius: 9999px !important; }");
    expect(out).toContain("background: red !important");
    expect(out).toContain("border-radius: 9999px !important");
    const blockMatches = out.match(/<style\s+id="nit-overrides"/g) ?? [];
    expect(blockMatches.length).toBe(1);
  });

  it("пустой css — без изменений", () => {
    const html = "<html><head></head><body></body></html>";
    expect(injectCssOverrides(html, "")).toBe(html);
  });
});

describe("CssPatchSchema", () => {
  it("валидный patch", () => {
    expect(
      CssPatchSchema.safeParse({
        rules: [{ selector: "body", properties: { color: "red" } }],
      }).success,
    ).toBe(true);
  });

  it("пустой rules отклоняется", () => {
    expect(CssPatchSchema.safeParse({ rules: [] }).success).toBe(false);
  });
});
