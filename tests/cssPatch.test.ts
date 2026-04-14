import { describe, it, expect } from "vitest";
import {
  rulesToCss,
  injectCssOverrides,
  scopeRules,
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
    const css = rulesToCss([{ selector: "a", properties: { color: "blue !important" } }]);
    expect(css).toContain("color: blue !important;");
    expect(css).not.toContain("!important !important");
  });
});

describe("scopeRules", () => {
  it("префиксует селекторы [data-nit-section="X"]", () => {
    const scoped = scopeRules(
      [{ selector: "h1", properties: { color: "red" } }],
      "hero",
    );
    expect(scoped[0]!.selector).toBe('[data-nit-section="hero"] h1');
  });

  it("body/html/* заменяет на сам префикс", () => {
    expect(
      scopeRules([{ selector: "body", properties: { color: "red" } }], "hero")[0]!.selector,
    ).toBe('[data-nit-section="hero"]');
    expect(
      scopeRules([{ selector: "html", properties: { color: "red" } }], "hero")[0]!.selector,
    ).toBe('[data-nit-section="hero"]');
  });

  it("префиксует каждый селектор в comma-list", () => {
    const scoped = scopeRules(
      [{ selector: "h1, h2, h3", properties: { color: "red" } }],
      "pricing",
    );
    expect(scoped[0]!.selector).toBe(
      '[data-nit-section="pricing"] h1, [data-nit-section="pricing"] h2, [data-nit-section="pricing"] h3',
    );
  });

  it("не трогает селекторы уже с data-nit-section", () => {
    const rule = {
      selector: '[data-nit-section="hero"] h1',
      properties: { color: "red" },
    };
    expect(scopeRules([rule], "hero")[0]!.selector).toBe(rule.selector);
  });

  it("сохраняет properties", () => {
    const scoped = scopeRules(
      [{ selector: "h1", properties: { color: "red", "font-size": "2rem" } }],
      "hero",
    );
    expect(scoped[0]!.properties).toEqual({ color: "red", "font-size": "2rem" });
  });
});

describe("injectCssOverrides", () => {
  it("вставляет новый блок перед </head>", () => {
    const html = "<!DOCTYPE html><html><head><title>X</title></head><body></body></html>";
    const out = injectCssOverrides(html, "body{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
    expect(out.indexOf('<style id="nit-overrides">'))
      .toBeLessThan(out.indexOf("</head>"));
  });

  it("дополняет существующий блок", () => {
    const html = `<!DOCTYPE html><html><head>
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

  it("пустой css — возвращает html без изменений", () => {
    const html = "<html><head></head><body></body></html>";
    expect(injectCssOverrides(html, "")).toBe(html);
  });
});

describe("CssPatchSchema", () => {
  it("валидирует корректный patch", () => {
    expect(
      CssPatchSchema.safeParse({
        rules: [{ selector: "body", properties: { color: "red" } }],
      }).success,
    ).toBe(true);
  });

  it("отклоняет пустой список", () => {
    expect(CssPatchSchema.safeParse({ rules: [] }).success).toBe(false);
  });
});
