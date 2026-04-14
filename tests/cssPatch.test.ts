import { describe, it, expect } from "vitest";
import {
  rulesToCss,
  injectCssOverrides,
  CssPatchSchema,
  extractSectionsFromHtml,
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

  it("сериализует несколько правил разделённых пустой строкой", () => {
    const css = rulesToCss([
      { selector: "h1", properties: { color: "red" } },
      { selector: "button", properties: { "border-radius": "9999px" } },
    ]);
    expect(css).toMatch(/h1 \{[\s\S]*\}\n\nbutton \{/);
  });

  it("не дублирует !important если модель уже вставила его", () => {
    const css = rulesToCss([
      { selector: "a", properties: { color: "blue !important" } },
    ]);
    expect(css).toContain("color: blue !important;");
    expect(css).not.toContain("!important !important");
  });

  it("правильно сериализует scoped-селекторы", () => {
    const css = rulesToCss([
      {
        selector: '[data-nit-section="hero"]',
        properties: { background: "#1e3a8a" },
      },
    ]);
    expect(css).toContain('[data-nit-section="hero"]');
    expect(css).toContain("background: #1e3a8a !important;");
  });
});

describe("injectCssOverrides", () => {
  it("вставляет новый блок перед </head>", () => {
    const html = "<!DOCTYPE html><html><head><title>X</title></head><body></body></html>";
    const out = injectCssOverrides(html, "body{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
    expect(out).toContain("body{color:red}");
    expect(out.indexOf('<style id="nit-overrides">'))
      .toBeLessThan(out.indexOf("</head>"));
  });

  it("дополняет существующий блок вместо замены", () => {
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

  it("вставляет в <body> если нет </head>", () => {
    const html = "<html><body>x</body></html>";
    const out = injectCssOverrides(html, "h1{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
    expect(out).toContain("h1{color:red}");
    expect(out.indexOf("<body")).toBeLessThan(out.indexOf('<style id="nit-overrides">'));
  });

  it("пустой css — возвращает html без изменений", () => {
    const html = "<html><head></head><body></body></html>";
    expect(injectCssOverrides(html, "")).toBe(html);
    expect(injectCssOverrides(html, "   ")).toBe(html);
  });
});

describe("CssPatchSchema", () => {
  it("валидирует корректный patch", () => {
    const ok = CssPatchSchema.safeParse({
      rules: [{ selector: "body", properties: { color: "red" } }],
    });
    expect(ok.success).toBe(true);
  });

  it("отклоняет пустой список правил", () => {
    const r = CssPatchSchema.safeParse({ rules: [] });
    expect(r.success).toBe(false);
  });

  it("отклоняет слишком много правил (>20)", () => {
    const rules = Array.from({ length: 21 }, (_, i) => ({
      selector: `s${i}`,
      properties: { color: "red" },
    }));
    expect(CssPatchSchema.safeParse({ rules }).success).toBe(false);
  });
});

describe("extractSectionsFromHtml", () => {
  it("извлекает все data-nit-section из HTML", () => {
    const html = `<section id="hero" data-nit-section="hero">x</section>
<section id="pricing" data-nit-section="pricing">y</section>`;
    const result = extractSectionsFromHtml(html);
    expect(result).toContain("hero");
    expect(result).toContain("pricing");
    expect(result.length).toBe(2);
  });

  it("дедуплицирует повторения", () => {
    const html = `<section data-nit-section="hero">a</section><div data-nit-section="hero">b</div>`;
    const result = extractSectionsFromHtml(html);
    expect(result).toEqual(["hero"]);
  });

  it("пустой HTML — пустой массив", () => {
    expect(extractSectionsFromHtml("")).toEqual([]);
    expect(extractSectionsFromHtml("<html></html>")).toEqual([]);
  });

  it("поддерживает одинарные кавычки", () => {
    expect(extractSectionsFromHtml("<section data-nit-section='hero'>x</section>"))
      .toEqual(["hero"]);
  });
});
