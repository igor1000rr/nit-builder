import { describe, it, expect } from "vitest";
import { rulesToCss, injectCssOverrides, CssPatchSchema } from "~/lib/services/cssPatch";

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

  describe("scope", () => {
    const SCOPE = '[data-nit-section="hero"]';

    it("префиксирует обычные селекторы scope'ом", () => {
      const css = rulesToCss(
        [{ selector: "h1", properties: { color: "red" } }],
        SCOPE,
      );
      expect(css).toContain(`${SCOPE} h1 {`);
    });

    it("body/html заменяются на сам scope (без потомка)", () => {
      const css = rulesToCss(
        [{ selector: "body", properties: { background: "red" } }],
        SCOPE,
      );
      expect(css).toContain(`${SCOPE} {`);
      expect(css).not.toContain(`${SCOPE} body`);
    });

    it("множественные селекторы через запятую — каждый префиксится", () => {
      const css = rulesToCss(
        [{ selector: "h1, h2, h3", properties: { color: "red" } }],
        SCOPE,
      );
      expect(css).toContain(`${SCOPE} h1`);
      expect(css).toContain(`${SCOPE} h2`);
      expect(css).toContain(`${SCOPE} h3`);
    });

    it("idempotent: если селектор уже начинается с scope — не дублирует", () => {
      const css = rulesToCss(
        [{ selector: `${SCOPE} h1`, properties: { color: "red" } }],
        SCOPE,
      );
      expect((css.match(/\[data-nit-section="hero"\]/g) ?? []).length).toBe(1);
    });

    it("смешанные: body и h1 в одном селекторе", () => {
      const css = rulesToCss(
        [{ selector: "body, h1", properties: { color: "red" } }],
        SCOPE,
      );
      // body → scope, h1 → scope h1
      expect(css).toMatch(/\[data-nit-section="hero"\],\s*\[data-nit-section="hero"\] h1/);
    });
  });
});

describe("injectCssOverrides", () => {
  it("вставляет новый блок перед </head>", () => {
    const html = "<!DOCTYPE html><html><head><title>X</title></head><body></body></html>";
    const out = injectCssOverrides(html, "body{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
    expect(out.indexOf('<style id="nit-overrides">')).toBeLessThan(out.indexOf("</head>"));
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

  it("вставляет в <body> если нет </head>", () => {
    const html = "<html><body>x</body></html>";
    const out = injectCssOverrides(html, "h1{color:red}");
    expect(out).toContain('<style id="nit-overrides">');
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
    expect(
      CssPatchSchema.safeParse({ rules: [{ selector: "body", properties: { color: "red" } }] })
        .success,
    ).toBe(true);
  });

  it("отклоняет пустой список", () => {
    expect(CssPatchSchema.safeParse({ rules: [] }).success).toBe(false);
  });

  it("отклоняет >20 правил", () => {
    const rules = Array.from({ length: 21 }, (_, i) => ({
      selector: `s${i}`,
      properties: { color: "red" },
    }));
    expect(CssPatchSchema.safeParse({ rules }).success).toBe(false);
  });
});
