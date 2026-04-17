import { describe, it, expect } from "vitest";
import { inferTemplateFromPrompt } from "~/lib/services/templateKeywordSelector";

describe("inferTemplateFromPrompt", () => {
  it("матчит keyword из bestFor напрямую", () => {
    expect(inferTemplateFromPrompt("нужна кофейня").id).toBe("coffee-shop");
    expect(inferTemplateFromPrompt("лендинг для барбершопа").id).toBe("barbershop");
  });

  it("матчит даже в середине фразы и в падежных формах (substring match)", () => {
    // substring "кофейн" поймается в "кофейни"
    expect(inferTemplateFromPrompt("открываю маленькую кофейню в центре").id).toBe("coffee-shop");
  });

  it("для несвязанного промпта возвращает fallback coffee-shop", () => {
    // совсем без матчей
    const res = inferTemplateFromPrompt("xxxyyyzzz");
    expect(res.id).toBe("coffee-shop");
  });

  it("возвращает sections списком", () => {
    const res = inferTemplateFromPrompt("фотограф портреты");
    expect(res.id).toBe("photographer");
    expect(res.sections).toContain("gallery");
    expect(res.sections).toContain("hero");
  });

  it("поле name всегда заполнено человекочитаемым именем", () => {
    const res = inferTemplateFromPrompt("разработчик портфолио");
    expect(res.id).toBe("portfolio-dev");
    expect(res.name.length).toBeGreaterThan(0);
  });

  it("идемпотентен — два одинаковых запроса = один template", () => {
    const a = inferTemplateFromPrompt("свадьба Настя и Паша");
    const b = inferTemplateFromPrompt("свадьба Настя и Паша");
    expect(a.id).toBe(b.id);
  });
});
