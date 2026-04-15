import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("~/lib/services/ragStore", () => ({
  search: vi.fn(),
  bm25Search: vi.fn(async () => []),
}));
vi.mock("~/lib/services/ragBootstrap", () => ({
  ensureSeeded: vi.fn(async () => {}),
}));
vi.mock("~/lib/services/ragReranker", () => ({
  rerank: vi.fn(async () => null),
  isRerankerDisabled: vi.fn(() => true),
}));

import { search } from "~/lib/services/ragStore";
import { decideAdaptiveK, buildFewShotPlansAdaptive } from "~/lib/services/fewShotBuilder";

const mockSearch = search as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSearch.mockReset();
  delete process.env.NIT_FEWSHOT_MAX_K;
  delete process.env.NIT_FEWSHOT_K;
  // Отключаем hybrid BM25 и reranker — тестируем только adaptive k поверх cosine
  process.env.NIT_HYBRID_BM25_ENABLED = "0";
  process.env.NIT_RERANKER_ENABLED = "0";
});

function buildMockResult(score: number, id: string = "d"): { doc: any; score: number } {
  return {
    doc: {
      id,
      text: `query ${id}`,
      category: "plan_example",
      metadata: {
        query: `q-${id}`,
        plan: {
          business_type: "бизнес",
          target_audience: "",
          tone: "тёплый",
          style_hints: "",
          color_mood: "warm-pastel",
          sections: ["hero"],
          keywords: ["k"],
          cta_primary: "CTA",
          language: "ru",
          suggested_template_id: "blank-landing",
        },
      },
      createdAt: 0,
    },
    score,
  };
}

describe("decideAdaptiveK", () => {
  it("score >= 0.85 → k=1", () => {
    expect(decideAdaptiveK(0.9)).toBe(1);
    expect(decideAdaptiveK(0.85)).toBe(1);
    expect(decideAdaptiveK(0.99)).toBe(1);
  });

  it("0.65 <= score < 0.85 → k=2", () => {
    expect(decideAdaptiveK(0.84)).toBe(2);
    expect(decideAdaptiveK(0.7)).toBe(2);
    expect(decideAdaptiveK(0.65)).toBe(2);
  });

  it("0.55 <= score < 0.65 → k=3", () => {
    expect(decideAdaptiveK(0.64)).toBe(3);
    expect(decideAdaptiveK(0.55)).toBe(3);
  });

  it("score < 0.55 → k=0", () => {
    expect(decideAdaptiveK(0.54)).toBe(0);
    expect(decideAdaptiveK(0.3)).toBe(0);
    expect(decideAdaptiveK(0)).toBe(0);
  });

  it("maxK ограничивает результат сверху", () => {
    expect(decideAdaptiveK(0.6, 1)).toBe(1);
    expect(decideAdaptiveK(0.7, 1)).toBe(1);
  });
});

describe("buildFewShotPlansAdaptive", () => {
  it("пусто когда search вернул пустоту", async () => {
    mockSearch.mockResolvedValue([]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.block).toBe("");
    expect(r.count).toBe(0);
  });

  it("пусто когда top score ниже 0.55", async () => {
    mockSearch.mockResolvedValue([buildMockResult(0.4, "low")]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.block).toBe("");
    expect(r.count).toBe(0);
    expect(r.topScore).toBeCloseTo(0.4);
  });

  it("k=1 на high score даже если кандидатов 5", async () => {
    mockSearch.mockResolvedValue([
      buildMockResult(0.9, "a"),
      buildMockResult(0.7, "b"),
      buildMockResult(0.6, "c"),
      buildMockResult(0.55, "d"),
      buildMockResult(0.5, "e"),
    ]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.count).toBe(1);
    expect(r.block).toContain("Пример 1");
    expect(r.block).not.toContain("Пример 2");
  });

  it("k=2 на mid score", async () => {
    mockSearch.mockResolvedValue([
      buildMockResult(0.7, "a"),
      buildMockResult(0.68, "b"),
      buildMockResult(0.6, "c"),
    ]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.count).toBe(2);
  });

  it("k=3 на низком score (но выше порога)", async () => {
    mockSearch.mockResolvedValue([
      buildMockResult(0.6, "a"),
      buildMockResult(0.58, "b"),
      buildMockResult(0.56, "c"),
    ]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.count).toBe(3);
  });

  it("NIT_FEWSHOT_MAX_K ограничивает результат", async () => {
    process.env.NIT_FEWSHOT_MAX_K = "1";
    mockSearch.mockResolvedValue([
      buildMockResult(0.6, "a"),
      buildMockResult(0.58, "b"),
      buildMockResult(0.56, "c"),
    ]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.count).toBe(1);
  });

  it("approxTokens > 0 когда блок собран", async () => {
    mockSearch.mockResolvedValue([buildMockResult(0.9, "a")]);
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.approxTokens).toBeGreaterThan(0);
  });

  it("graceful при ошибке search", async () => {
    mockSearch.mockRejectedValue(new Error("boom"));
    const r = await buildFewShotPlansAdaptive("x");
    expect(r.block).toBe("");
    expect(r.count).toBe(0);
  });
});
