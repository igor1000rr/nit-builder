import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rerank, isRerankerDisabled, resetRerankerState } from "~/lib/services/ragReranker";

const originalFetch = global.fetch;

beforeEach(() => {
  resetRerankerState();
  delete process.env.NIT_RERANKER_ENABLED;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockRerankResponse(scores: number[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: scores.map((score, index) => ({ index, relevance_score: score })),
    }),
  } as Response);
}

describe("isRerankerDisabled", () => {
  it("false по умолчанию", () => {
    expect(isRerankerDisabled()).toBe(false);
  });

  it("true если NIT_RERANKER_ENABLED=0", () => {
    process.env.NIT_RERANKER_ENABLED = "0";
    expect(isRerankerDisabled()).toBe(true);
  });
});

describe("rerank", () => {
  it("возвращает null когда reranker disabled", async () => {
    process.env.NIT_RERANKER_ENABLED = "0";
    const result = await rerank("q", [{ id: "a", text: "text a" }]);
    expect(result).toBeNull();
  });

  it("возвращает [] на пустой список candidates", async () => {
    const result = await rerank("q", []);
    expect(result).toEqual([]);
  });

  it("возвращает null на пустой query", async () => {
    const result = await rerank("   ", [{ id: "a", text: "text a" }]);
    expect(result).toEqual([]);
  });

  it("возвращает scores в исходном порядке candidates", async () => {
    mockRerankResponse([0.9, 0.3, 0.7]);
    const result = await rerank("кофейня", [
      { id: "a", text: "бариста" },
      { id: "b", text: "юрист" },
      { id: "c", text: "эспрессо" },
    ]);
    expect(result).toEqual([
      { id: "a", score: 0.9 },
      { id: "b", score: 0.3 },
      { id: "c", score: 0.7 },
    ]);
  });

  it("кэширует scores между вызовами с тем же query+id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.85 }] }),
    } as Response);
    global.fetch = fetchMock;

    await rerank("кофейня", [{ id: "a", text: "бариста" }]);
    await rerank("кофейня", [{ id: "a", text: "бариста" }]);

    // Второй вызов не делает HTTP
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("при HTTP-ошибке возвращает null и disabled навсегда", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const result = await rerank("q", [{ id: "a", text: "x" }]);
    expect(result).toBeNull();
    expect(isRerankerDisabled()).toBe(true);
  });

  it("при сетевой ошибке возвращает null", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await rerank("q", [{ id: "a", text: "x" }]);
    expect(result).toBeNull();
  });

  it("пропускает user AbortError выше", async () => {
    const ac = new AbortController();
    ac.abort();
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    await expect(rerank("q", [{ id: "a", text: "x" }], ac.signal)).rejects.toThrow();
  });

  it("поддерживает оба имени поля score (relevance_score и score)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, score: 0.4 },
        ],
      }),
    } as Response);
    const result = await rerank("q", [
      { id: "a", text: "x" },
      { id: "b", text: "y" },
    ]);
    expect(result).toEqual([
      { id: "a", score: 0.9 },
      { id: "b", score: 0.4 },
    ]);
  });
});
