import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyEmbeddingPrefix,
  getEmbeddingPrefix,
  resetEmbeddingState,
} from "~/lib/services/ragEmbeddings";

describe("applyEmbeddingPrefix", () => {
  beforeEach(() => {
    delete process.env.NIT_EMBEDDING_QUERY_PREFIX;
    delete process.env.NIT_EMBEDDING_PASSAGE_PREFIX;
    resetEmbeddingState();
  });
  afterEach(() => {
    delete process.env.NIT_EMBEDDING_QUERY_PREFIX;
    delete process.env.NIT_EMBEDDING_PASSAGE_PREFIX;
  });

  it("без ENV префиксов возвращает текст без изменений (symmetric модель)", () => {
    expect(applyEmbeddingPrefix("кофейня в центре", "query")).toBe("кофейня в центре");
    expect(applyEmbeddingPrefix("кофейня в центре", "passage")).toBe("кофейня в центре");
  });

  it("применяет query-префикс (e5-style)", () => {
    process.env.NIT_EMBEDDING_QUERY_PREFIX = "query: ";
    expect(applyEmbeddingPrefix("кофейня", "query")).toBe("query: кофейня");
    expect(applyEmbeddingPrefix("кофейня", "passage")).toBe("кофейня"); // пассаж без префикса
  });

  it("применяет passage-префикс (e5-style)", () => {
    process.env.NIT_EMBEDDING_PASSAGE_PREFIX = "passage: ";
    expect(applyEmbeddingPrefix("документ", "passage")).toBe("passage: документ");
    expect(applyEmbeddingPrefix("документ", "query")).toBe("документ");
  });

  it("идемпотентно: не дублирует уже присутствующий префикс", () => {
    process.env.NIT_EMBEDDING_QUERY_PREFIX = "query: ";
    const result = applyEmbeddingPrefix("query: кофейня", "query");
    expect(result).toBe("query: кофейня");
  });

  it("работает с другими форматами префиксов (jina, instructor)", () => {
    process.env.NIT_EMBEDDING_QUERY_PREFIX = "Represent this query: ";
    expect(applyEmbeddingPrefix("кофейня", "query")).toBe(
      "Represent this query: кофейня",
    );
  });
});

describe("getEmbeddingPrefix", () => {
  beforeEach(() => {
    delete process.env.NIT_EMBEDDING_QUERY_PREFIX;
    delete process.env.NIT_EMBEDDING_PASSAGE_PREFIX;
    resetEmbeddingState();
  });
  afterEach(() => {
    delete process.env.NIT_EMBEDDING_QUERY_PREFIX;
    delete process.env.NIT_EMBEDDING_PASSAGE_PREFIX;
  });

  it("возвращает пустую строку по умолчанию", () => {
    expect(getEmbeddingPrefix("query")).toBe("");
    expect(getEmbeddingPrefix("passage")).toBe("");
  });

  it("раздельные префиксы query и passage не перекрываются", () => {
    process.env.NIT_EMBEDDING_QUERY_PREFIX = "Q: ";
    process.env.NIT_EMBEDDING_PASSAGE_PREFIX = "P: ";
    expect(getEmbeddingPrefix("query")).toBe("Q: ");
    expect(getEmbeddingPrefix("passage")).toBe("P: ");
  });
});
