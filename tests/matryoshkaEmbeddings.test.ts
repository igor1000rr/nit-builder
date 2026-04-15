import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  truncateAndRenormalize,
  getTargetEmbeddingDims,
  resetEmbeddingState,
} from "~/lib/services/ragEmbeddings";

describe("truncateAndRenormalize", () => {
  it("возвращает вход без изменений если вектор короче целевой размерности", () => {
    const v = [0.5, 0.5, 0.5, 0.5];
    const result = truncateAndRenormalize(v, 768);
    expect(result).toBe(v); // тот же объект — без копирования
  });

  it("усекает и нормализует вектор до единичной длины", () => {
    // Произвольный не-единичный вектор
    const v = [3, 4, 5, 12, 100, 50];
    const result = truncateAndRenormalize(v, 4);
    expect(result).toHaveLength(4);
    // Проверяем L2-norm = 1 (с точностью float)
    const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1.0, 6);
    // Сохраняет относительные пропорции между компонентами (3:4 = result[0]:result[1])
    expect(result[0]! / result[1]!).toBeCloseTo(3 / 4, 6);
  });

  it("обрабатывает zero-vector без падения (NaN защита)", () => {
    const v = [0, 0, 0, 0, 0];
    const result = truncateAndRenormalize(v, 3);
    expect(result).toEqual([0, 0, 0]);
  });

  it("слайсит первые N измерений (Matryoshka order)", () => {
    // Для Matryoshka важно что именно СНАЧАЛА вектора находятся самые важные измерения
    const v = [10, 0, 0, 0, 999, 999];
    const result = truncateAndRenormalize(v, 3);
    expect(result).toHaveLength(3);
    // После norm первый элемент должен быть 1.0 (в пределах точности float),
    // остальные = 0; 999 измерения НЕ попали в slice — это ключевая проверка
    expect(result[0]).toBeCloseTo(1.0, 6);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });
});

describe("getTargetEmbeddingDims", () => {
  beforeEach(() => {
    delete process.env.NIT_EMBEDDING_DIMS;
    resetEmbeddingState();
  });
  afterEach(() => {
    delete process.env.NIT_EMBEDDING_DIMS;
  });

  it("возвращает null по умолчанию (full dim)", () => {
    expect(getTargetEmbeddingDims()).toBeNull();
  });

  it("читает валидное число из ENV", () => {
    process.env.NIT_EMBEDDING_DIMS = "256";
    expect(getTargetEmbeddingDims()).toBe(256);
    process.env.NIT_EMBEDDING_DIMS = "128";
    expect(getTargetEmbeddingDims()).toBe(128);
  });

  it("возвращает null при невалидных значениях", () => {
    process.env.NIT_EMBEDDING_DIMS = "abc";
    expect(getTargetEmbeddingDims()).toBeNull();
    process.env.NIT_EMBEDDING_DIMS = "0";
    expect(getTargetEmbeddingDims()).toBeNull();
    process.env.NIT_EMBEDDING_DIMS = "-128";
    expect(getTargetEmbeddingDims()).toBeNull();
  });
});
