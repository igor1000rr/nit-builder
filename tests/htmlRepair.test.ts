import { describe, it, expect } from "vitest";
import { repairTruncatedHtml } from "~/lib/utils/htmlRepair";

describe("repairTruncatedHtml", () => {
  it("returns complete HTML unchanged", () => {
    const html = "<!DOCTYPE html><html><body><div>test</div></body></html>";
    expect(repairTruncatedHtml(html)).toBe(html);
  });

  it("closes missing </html>", () => {
    const html = "<!DOCTYPE html><html><body><div>test</div></body>";
    const result = repairTruncatedHtml(html);
    expect(result).toContain("</html>");
  });

  it("closes missing </body> and </html>", () => {
    const html = "<!DOCTYPE html><html><body><div>test</div>";
    const result = repairTruncatedHtml(html);
    expect(result).toContain("</div>");
    expect(result).toContain("</body>");
    expect(result).toContain("</html>");
  });

  it("closes multiple unclosed tags in reverse order", () => {
    const html = "<html><body><div><section><h1>Hello";
    const result = repairTruncatedHtml(html);
    // Should close h1, section, div, body, html
    expect(result).toContain("</h1>");
    expect(result).toContain("</section>");
    expect(result).toContain("</div>");
    expect(result).toContain("</body>");
    expect(result).toContain("</html>");
  });

  it("handles truncation mid-tag", () => {
    const html = '<html><body><div class="foo';
    const result = repairTruncatedHtml(html);
    // The incomplete tag should be removed
    expect(result).not.toContain('class="foo');
    expect(result).toContain("</body>");
    expect(result).toContain("</html>");
  });

  it("handles void elements correctly (no closing for img, br, etc)", () => {
    const html = '<html><body><img src="test.jpg"><br><div>hello';
    const result = repairTruncatedHtml(html);
    expect(result).not.toContain("</img>");
    expect(result).not.toContain("</br>");
    expect(result).toContain("</div>");
  });

  it("handles self-closing tags correctly", () => {
    const html = '<html><body><div /><section>content';
    const result = repairTruncatedHtml(html);
    expect(result).not.toContain("</div>"); // self-closing doesn't need close
    expect(result).toContain("</section>");
  });

  it("returns empty string for empty input", () => {
    expect(repairTruncatedHtml("")).toBe("");
  });

  it("handles already-closed tags correctly (no duplicate closings)", () => {
    const html = "<html><body><div>a</div><div>b</div></body>";
    const result = repairTruncatedHtml(html);
    // Should only add </html>, not duplicate </div> or </body>
    const bodyCloseCount = (result.match(/<\/body>/g) ?? []).length;
    expect(bodyCloseCount).toBe(1);
  });

  it("handles real-world truncated template", () => {
    const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Test</title></head>
<body class="bg-white">
<nav><div>Menu</div></nav>
<section id="hero">
  <h1>Hello World</h1>
  <p>Description`;
    const result = repairTruncatedHtml(html);
    expect(result).toContain("</p>");
    expect(result).toContain("</section>");
    expect(result).toContain("</body>");
    expect(result).toContain("</html>");
  });
});
