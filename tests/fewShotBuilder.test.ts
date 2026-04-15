import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("~/lib/services/ragStore", () => ({
  search: vi.fn(),
}));
vi.mock("~/lib/services/ragBootstrap", () => ({
  ensureSeeded: vi.fn(async () => {}),
}));

import { search } from "~/lib/services/ragStore";
import { buildFewShotPlansBlock } from "~/lib/services/fewShotBuilder";

const mockSearch = search as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSearch.mockReset();
});

describe("buildFewShotPlansBlock", () => {
  it("пустая строка когда нет результатов", async () => {
    mockSearch.mockResolvedValue([]);
    const block = await buildFewShotPlansBlock("x");
    expect(block).toBe("");
  });

  it("пустая строка когда score ниже 0.55", async () => {
    mockSearch.mockResolvedValue([
      {
        doc: {
          id: "low",
          text: "q",
          category: "plan_example",
          metadata: { query: "q", plan: { business_type: "x" } },
          createdAt: 0,
        },
        score: 0.3,
      },
    ]);
    const block = await buildFewShotPlansBlock("x");
    expect(block).toBe("");
  });

  it("собирает блок с примерами выше порога", async () => {
    mockSearch.mockResolvedValue([
      {
        doc: {
          id: "hi",
          text: "кофейня",
          category: "plan_example",
          metadata: {
            query: "кофейня в центре",
            plan: { business_type: "кофейня", sections: ["hero"] },
          },
          createdAt: 0,
        },
        score: 0.85,
      },
    ]);
    const block = await buildFewShotPlansBlock("кофейня");
    expect(block).toContain("ПРИМЕРЫ ХОРОШИХ ПЛАНОВ");
    expect(block).toContain("Пример 1");
    expect(block).toContain("85%");
    expect(block).toContain("кофейня в центре");
    expect(block).toContain("business_type");
  });

  it("ограничивает до k (по умолчанию 2)", async () => {
    mockSearch.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        doc: {
          id: `d${i}`,
          text: `t${i}`,
          category: "plan_example",
          metadata: { query: `q${i}`, plan: { business_type: `b${i}` } },
          createdAt: 0,
        },
        score: 0.9 - i * 0.01,
      })),
    );
    const block = await buildFewShotPlansBlock("test");
    const exampleMatches = block.match(/Пример \d+/g) ?? [];
    expect(exampleMatches.length).toBe(2);
  });

  it("гracefully handle search error", async () => {
    mockSearch.mockRejectedValue(new Error("boom"));
    const block = await buildFewShotPlansBlock("x");
    expect(block).toBe("");
  });

  it("пропускает документы без plan в metadata", async () => {
    mockSearch.mockResolvedValue([
      {
        doc: {
          id: "broken",
          text: "q",
          category: "plan_example",
          metadata: { query: "q" }, // нет plan
          createdAt: 0,
        },
        score: 0.8,
      },
    ]);
    const block = await buildFewShotPlansBlock("x");
    expect(block).toBe("");
  });
});
