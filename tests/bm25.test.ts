import { describe, it, expect } from "vitest";
import { tokenize, BM25Index } from "~/lib/services/bm25";

describe("tokenize", () => {
  it("ловит латиницу + кириллицу в lowercase", () => {
    expect(tokenize("BMW под ремонт")).toContain("bmw");
  });

  it("сохраняет версии с точками и цифры", () => {
    const tokens = tokenize("IELTS 7.0 за 4 месяца");
    expect(tokens).toContain("ielts");
    expect(tokens).toContain("7.0");
    expect(tokens).toContain("4");
  });

  it("сохраняет дефисы внутри слов", () => {
    expect(tokenize("b2b-сервис")).toEqual(expect.arrayContaining(["b2b-серви"]));
  });

  it("фильтрует stop words", () => {
    expect(tokenize("я и вы в городе")).not.toContain("в");
    expect(tokenize("the and a coffee")).not.toContain("the");
  });

  it("снимает окончания у длинных русских слов", () => {
    const a = tokenize("кофейня");
    const b = tokenize("кофейню");
    // Оба сведутся к общему стему (приблизительно кофейн-)
    expect(a[0]).toBe(b[0]);
  });

  it("пустая строка → пустой массив", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("BM25Index", () => {
  it("пустой индекс возвращает []", () => {
    const idx = new BM25Index([]);
    expect(idx.size()).toBe(0);
    expect(idx.search("q")).toEqual([]);
  });

  it("находит док по редкому термину (BMW)", () => {
    const idx = new BM25Index([
      { id: "car-bmw", text: "автосервис BMW Audi Mercedes ремонт" },
      { id: "coffee", text: "кофейня в центре эспрессо латте" },
      { id: "dental", text: "стоматология для детей и взрослых" },
    ]);
    const results = idx.search("BMW");
    expect(results[0]?.id).toBe("car-bmw");
  });

  it("находит док по версии с точкой (IELTS 7.0)", () => {
    const idx = new BM25Index([
      { id: "english", text: "репетитор английского подготовка IELTS балл 7.0" },
      { id: "other", text: "сайт для кофейни с меню" },
    ]);
    const results = idx.search("IELTS 7.0");
    expect(results[0]?.id).toBe("english");
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("IDF выше у редких терминов", () => {
    // 'site' во всех доках, 'BMW' в одном — BMW должен выиграть по вкладу
    const idx = new BM25Index([
      { id: "a", text: "site BMW repair shop" },
      { id: "b", text: "site coffee shop center" },
      { id: "c", text: "site dental clinic family" },
    ]);
    const bmwResults = idx.search("BMW site");
    const siteOnly = idx.search("site");
    // Док 'a' (имеет BMW) получит больший score потому что BMW реже
    expect(bmwResults[0]?.id).toBe("a");
    // Но в site-only запросе все доки получат одинаковый score по term
    expect(siteOnly).toHaveLength(3);
  });

  it("работает с перефразировками через stemming", () => {
    const idx = new BM25Index([
      { id: "coffee", text: "кофейня в центре города" },
      { id: "other", text: "стоматология для детей" },
    ]);
    // Query использует винительный, doc — именительный
    const results = idx.search("открываю кофейню");
    expect(results[0]?.id).toBe("coffee");
  });

  it("возвращает [] когда ни одного term нет в индексе", () => {
    const idx = new BM25Index([{ id: "a", text: "кофе" }]);
    expect(idx.search("BMW")).toEqual([]);
  });

  it("ограничивает вывод по k", () => {
    const idx = new BM25Index([
      { id: "a", text: "кофе 1" },
      { id: "b", text: "кофе 2" },
      { id: "c", text: "кофе 3" },
    ]);
    expect(idx.search("кофе", 2)).toHaveLength(2);
  });
});
