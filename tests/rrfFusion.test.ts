import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "~/lib/services/rrfFusion";

describe("reciprocalRankFusion", () => {
  it("пустой вход → []", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("один ranking просто возвращает тот же порядок", () => {
    const result = reciprocalRankFusion([["a", "b", "c"]]);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("док присутствующий в обоих ranking-ах побеждает", () => {
    const result = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "a", "d"],
    ]);
    // 'a' в позициях 1 и 2, 'b' в позициях 2 и 1 — примерно равны
    // 'c' и 'd' появляются только в одном
    expect(result[0]?.id).toMatch(/^[ab]$/);
    expect(result[1]?.id).toMatch(/^[ab]$/);
    expect(result.slice(2).map((r) => r.id).sort()).toEqual(["c", "d"]);
  });

  it("высокий rank важнее лишь одного хорошего ранжирования", () => {
    const result = reciprocalRankFusion([
      ["a", "x", "y", "z"],   // a top-1
      ["a", "x", "y", "z"],   // a top-1 опять
    ]);
    expect(result[0]?.id).toBe("a");
  });

  it("k=60 даёт известные RRF scores", () => {
    // Для одного ranking с a на 1-ой позиции: 1/(60+1) = 0.01639
    const result = reciprocalRankFusion([["a", "b"]]);
    expect(result[0]?.rrfScore).toBeCloseTo(1 / 61, 4);
    expect(result[1]?.rrfScore).toBeCloseTo(1 / 62, 4);
  });

  it("кастомный k меняет scores пропорционально", () => {
    const r60 = reciprocalRankFusion([["a"]], 60);
    const r10 = reciprocalRankFusion([["a"]], 10);
    expect(r10[0]!.rrfScore).toBeGreaterThan(r60[0]!.rrfScore);
  });

  it("сохраняет все уникальные id из всех ranking-ов", () => {
    const result = reciprocalRankFusion([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});
