import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  recordGeneration,
  readRecentFeedback,
  countFeedback,
  _resetFeedbackState,
} from "~/lib/services/feedbackStore";

let tmpPath: string;

async function waitForWrites(): Promise<void> {
  // recordGeneration — fire-and-forget. Параллельные fs.appendFile вызовы
  // разрешаются только после того как event loop успеет обработать
  // и микротаски и I/O callback'и. setImmediate в цикле этого недостаточно
  // если приходится несколько fs round-trip-ов — даём 50ms реального времени.
  await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
  _resetFeedbackState();
  tmpPath = path.join(
    os.tmpdir(),
    `nit-feedback-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  process.env.NIT_FEEDBACK_LOG_PATH = tmpPath;
  process.env.NIT_FEEDBACK_ENABLED = "1";
});

afterEach(async () => {
  delete process.env.NIT_FEEDBACK_LOG_PATH;
  delete process.env.NIT_FEEDBACK_ENABLED;
  try {
    await fs.unlink(tmpPath);
  } catch {
    /* ok */
  }
});

describe("feedbackStore", () => {
  it("recordGeneration no-op при отключённом флаге", async () => {
    delete process.env.NIT_FEEDBACK_ENABLED;
    recordGeneration({
      sessionId: "s1",
      mode: "create",
      outcome: "success",
      provider: "lmstudio",
      model: "qwen",
      durationMs: 100,
      userMessage: "test",
    });
    await waitForWrites();
    expect(await countFeedback()).toBe(0);
  });

  it("пишет одну запись при включённом флаге", async () => {
    recordGeneration({
      sessionId: "s1",
      mode: "create",
      outcome: "success",
      provider: "lmstudio",
      model: "qwen",
      durationMs: 1234,
      userMessage: "кофейня в Минске",
      templateId: "coffee-shop",
    });
    await waitForWrites();
    expect(await countFeedback()).toBe(1);
    const records = await readRecentFeedback();
    expect(records[0]?.sessionId).toBe("s1");
    expect(records[0]?.templateId).toBe("coffee-shop");
    expect(records[0]?.durationMs).toBe(1234);
    expect(records[0]?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("append: не затирает предыдущие записи", async () => {
    for (let i = 0; i < 3; i++) {
      recordGeneration({
        sessionId: `s${i}`,
        mode: "create",
        outcome: "success",
        provider: "lmstudio",
        model: "qwen",
        durationMs: i * 100,
        userMessage: `q${i}`,
      });
    }
    await waitForWrites();
    expect(await countFeedback()).toBe(3);
    const records = await readRecentFeedback();
    expect(records.map((r) => r.sessionId).sort()).toEqual(["s0", "s1", "s2"]);
  });

  it("усекает userMessage до 500 chars", async () => {
    const long = "а".repeat(1000);
    recordGeneration({
      sessionId: "s1",
      mode: "create",
      outcome: "success",
      provider: "lmstudio",
      model: "qwen",
      durationMs: 100,
      userMessage: long,
    });
    await waitForWrites();
    const records = await readRecentFeedback();
    expect(records[0]?.userMessage.length).toBe(500);
  });

  it("пишет error-запись с errorReason", async () => {
    recordGeneration({
      sessionId: "s1",
      mode: "polish",
      outcome: "error",
      provider: "lmstudio",
      model: "qwen",
      durationMs: 500,
      userMessage: "test",
      errorReason: "context_overflow",
    });
    await waitForWrites();
    const records = await readRecentFeedback();
    expect(records[0]?.outcome).toBe("error");
    expect(records[0]?.errorReason).toBe("context_overflow");
  });

  it("пишет polish-специфичные поля", async () => {
    recordGeneration({
      sessionId: "s1",
      mode: "polish",
      outcome: "success",
      provider: "lmstudio",
      model: "qwen",
      durationMs: 2000,
      userMessage: "сделай героя синим",
      polishIntent: "css_patch",
      polishTargetSection: "hero",
      cssPatchRuleCount: 3,
    });
    await waitForWrites();
    const records = await readRecentFeedback();
    expect(records[0]?.polishIntent).toBe("css_patch");
    expect(records[0]?.polishTargetSection).toBe("hero");
    expect(records[0]?.cssPatchRuleCount).toBe(3);
  });

  it("readRecentFeedback ограничивает последними N", async () => {
    for (let i = 0; i < 15; i++) {
      recordGeneration({
        sessionId: `s${i}`,
        mode: "create",
        outcome: "success",
        provider: "lmstudio",
        model: "qwen",
        durationMs: 100,
        userMessage: `q${i}`,
      });
    }
    // Для 15 параллельных fs.appendFile нужно больше времени
    await new Promise((r) => setTimeout(r, 100));
    const records = await readRecentFeedback(5);
    expect(records.length).toBe(5);
    // Последние 5 — это s10..s14
    expect(records[0]?.sessionId).toBe("s10");
    expect(records[4]?.sessionId).toBe("s14");
  });

  it("readRecentFeedback возвращает [] для несуществующего файла", async () => {
    process.env.NIT_FEEDBACK_LOG_PATH = "/tmp/nonexistent-nit-feedback-xxxxx.jsonl";
    expect(await readRecentFeedback()).toEqual([]);
    expect(await countFeedback()).toBe(0);
  });
});
