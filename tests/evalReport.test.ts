import { describe, it, expect } from "vitest";
import { diffSummaries, formatDiff } from "~/lib/eval/report";
import type { EvalRunSummary } from "~/lib/eval/types";

function makeSummary(overrides: Partial<EvalRunSummary> = {}): EvalRunSummary {
  return {
    total: 10,
    passed: 7,
    passRate: 0.7,
    meanLatencyMs: 1000,
    avgNumericFacts: 1.5,
    bannedPhraseRate: 0.1,
    fewShotHitRate: 0.8,
    templateMatchRate: 0.9,
    perCheckPassRate: {
      plan_schema_valid: 1.0,
      has_pricing_tiers_when_expected: 0.5,
      has_faq_when_expected: 0.4,
    },
    ...overrides,
  };
}

describe("diffSummaries — top-level metrics", () => {
  it("detects regression в passRate", () => {
    const before = makeSummary({ passRate: 0.8 });
    const after = makeSummary({ passRate: 0.7 });
    const diff = diffSummaries(before, after);

    const passRow = diff.rows.find((r) => r.metric === "passRate")!;
    expect(passRow.before).toBe(0.8);
    expect(passRow.after).toBe(0.7);
    expect(passRow.delta).toBeCloseTo(-0.1);
    expect(passRow.improved).toBe(false);
    expect(diff.regressions.some((r) => r.metric === "passRate")).toBe(true);
  });

  it("detects improvement в passRate", () => {
    const before = makeSummary({ passRate: 0.5 });
    const after = makeSummary({ passRate: 0.8 });
    const diff = diffSummaries(before, after);

    expect(diff.improvements.some((r) => r.metric === "passRate")).toBe(true);
    expect(diff.regressions.some((r) => r.metric === "passRate")).toBe(false);
  });

  it("meanLatencyMs — меньше = лучше", () => {
    const before = makeSummary({ meanLatencyMs: 2000 });
    const after = makeSummary({ meanLatencyMs: 1000 });
    const diff = diffSummaries(before, after);

    const row = diff.rows.find((r) => r.metric === "meanLatencyMs")!;
    expect(row.improved).toBe(true);
    expect(diff.improvements.some((r) => r.metric === "meanLatencyMs")).toBe(true);
  });

  it("bannedPhraseRate — меньше = лучше", () => {
    const before = makeSummary({ bannedPhraseRate: 0.05 });
    const after = makeSummary({ bannedPhraseRate: 0.25 });
    const diff = diffSummaries(before, after);

    const row = diff.rows.find((r) => r.metric === "bannedPhraseRate")!;
    expect(row.improved).toBe(false);
    expect(diff.regressions.some((r) => r.metric === "bannedPhraseRate")).toBe(true);
  });
});

describe("diffSummaries — per-check", () => {
  it("детектит улучшение has_pricing_tiers_when_expected", () => {
    const before = makeSummary({
      perCheckPassRate: {
        plan_schema_valid: 1.0,
        has_pricing_tiers_when_expected: 0.4,
      },
    });
    const after = makeSummary({
      perCheckPassRate: {
        plan_schema_valid: 1.0,
        has_pricing_tiers_when_expected: 0.8,
      },
    });
    const diff = diffSummaries(before, after);

    const row = diff.rows.find((r) => r.metric === "check:has_pricing_tiers_when_expected")!;
    expect(row.delta).toBeCloseTo(0.4);
    expect(row.improved).toBe(true);
    expect(diff.improvements.some((r) => r.metric === "check:has_pricing_tiers_when_expected")).toBe(
      true,
    );
  });

  it("новый check (отсутствующий в baseline) считается delta от 0", () => {
    const before = makeSummary({
      perCheckPassRate: { plan_schema_valid: 1.0 },
    });
    const after = makeSummary({
      perCheckPassRate: { plan_schema_valid: 1.0, has_new_check: 0.9 },
    });
    const diff = diffSummaries(before, after);
    const row = diff.rows.find((r) => r.metric === "check:has_new_check")!;
    expect(row.before).toBe(0);
    expect(row.after).toBe(0.9);
  });
});

describe("diffSummaries — regressionThreshold", () => {
  it("отфильтровывает незначительные изменения", () => {
    const before = makeSummary({ passRate: 0.70 });
    const after = makeSummary({ passRate: 0.71 });
    const diff = diffSummaries(before, after, 0.02);
    expect(diff.regressions.length).toBe(0);
    expect(diff.improvements.length).toBe(0);
  });

  it("кастомный threshold", () => {
    const before = makeSummary({ passRate: 0.70 });
    const after = makeSummary({ passRate: 0.72 });
    // threshold 0.01 → 0.02 delta значимо
    expect(diffSummaries(before, after, 0.01).improvements.length).toBeGreaterThan(0);
    // threshold 0.05 → 0.02 delta незначимо
    expect(diffSummaries(before, after, 0.05).improvements.length).toBe(0);
  });
});

describe("formatDiff", () => {
  it("стабильное сообщение когда нет изменений", () => {
    const before = makeSummary();
    const after = makeSummary();
    const diff = diffSummaries(before, after);
    const text = formatDiff(diff);
    expect(text).toContain("Нет значимых изменений");
  });

  it("включает секцию регрессий и улучшений когда обе есть", () => {
    const before = makeSummary({
      passRate: 0.8,
      meanLatencyMs: 1000,
      perCheckPassRate: {
        has_pricing_tiers_when_expected: 0.4,
        has_faq_when_expected: 0.9,
      },
    });
    const after = makeSummary({
      passRate: 0.6, // регрессия
      meanLatencyMs: 800, // улучшение
      perCheckPassRate: {
        has_pricing_tiers_when_expected: 0.8, // улучшение
        has_faq_when_expected: 0.5, // регрессия
      },
    });
    const diff = diffSummaries(before, after);
    const text = formatDiff(diff);
    expect(text).toContain("Регрессии");
    expect(text).toContain("Улучшения");
    expect(text).toContain("passRate");
    expect(text).toContain("check:has_pricing_tiers_when_expected");
  });
});
