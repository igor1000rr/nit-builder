import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Мокаем embedText чтобы не звонить в LM Studio
vi.mock("~/lib/services/ragEmbeddings", () => ({
  embedText: vi.fn(async (text: string) => {
    // Детерминированный 4-dim вектор от длины + первых байт — достаточно для cosine-тестов
    const hash = Array.from(text.slice(0, 8)).reduce((s, c) => s + c.charCodeAt(0), 0);
    return [text.length / 100, hash / 1000, (hash % 17) / 10, 0.5];
  }),
  isRagDisabled: vi.fn(() => false),
  resetEmbeddingState: vi.fn(),
}));

import {
  addDocument,
  search,
  getStats,
  hasDocument,
  _resetForTests,
} from "~/lib/services/ragStore";

let tmpPath: string;

beforeEach(async () => {
  await _resetForTests();
  tmpPath = path.join(
    os.tmpdir(),
    `nit-rag-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`,
  );
  process.env.NIT_RAG_PATH = tmpPath;
});

afterEach(async () => {
  delete process.env.NIT_RAG_PATH;
  try {
    await fs.unlink(tmpPath);
  } catch {
    /* ok */
  }
});

describe("ragStore", () => {
  it("addDocument + search возвращает документ", async () => {
    await addDocument({
      id: "test-1",
      text: "кофейня в центре",
      category: "plan_example",
      metadata: { niche: "coffee-shop" },
    });
    const results = await search("кофейня");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.doc.id).toBe("test-1");
  });

  it("фильтр по category", async () => {
    await addDocument({
      id: "a",
      text: "текст A",
      category: "plan_example",
      metadata: {},
    });
    await addDocument({
      id: "b",
      text: "текст B",
      category: "hero_headline",
      metadata: {},
    });
    const plansOnly = await search("текст", { category: "plan_example" });
    expect(plansOnly.every((r) => r.doc.category === "plan_example")).toBe(true);
    expect(plansOnly.map((r) => r.doc.id)).toContain("a");
    expect(plansOnly.map((r) => r.doc.id)).not.toContain("b");
  });

  it("дубликаты по id — no-op", async () => {
    await addDocument({ id: "dup", text: "текст", category: "plan_example" });
    await addDocument({ id: "dup", text: "другой текст", category: "plan_example" });
    const stats = getStats();
    expect(stats.byCategory.plan_example).toBe(1);
  });

  it("hasDocument true/false", async () => {
    expect(await hasDocument("nope")).toBe(false);
    await addDocument({ id: "yes", text: "x", category: "plan_example" });
    expect(await hasDocument("yes")).toBe(true);
  });

  it("персистит в JSONL", async () => {
    await addDocument({
      id: "persist-me",
      text: "test text",
      category: "plan_example",
      metadata: { key: "value" },
    });
    const content = await fs.readFile(tmpPath, "utf8");
    expect(content).toContain("persist-me");
    expect(content).toContain("test text");
  });

  it("skipPersist не пишет на диск", async () => {
    await addDocument({
      id: "ephemeral",
      text: "x",
      category: "plan_example",
      skipPersist: true,
    });
    try {
      const content = await fs.readFile(tmpPath, "utf8");
      expect(content).not.toContain("ephemeral");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  });

  it("getStats исключает sentinel", async () => {
    await addDocument({
      id: "__seed_sentinel:v1",
      text: "sentinel",
      category: "plan_example",
      metadata: { isSentinel: true },
    });
    await addDocument({
      id: "real",
      text: "real doc",
      category: "plan_example",
    });
    const stats = getStats();
    expect(stats.total).toBe(1);
    expect(stats.byCategory.plan_example).toBe(1);
  });

  it("search исключает sentinel из результатов", async () => {
    await addDocument({
      id: "__seed_sentinel:v1",
      text: "sentinel text matches query",
      category: "plan_example",
      metadata: { isSentinel: true },
    });
    await addDocument({
      id: "real",
      text: "real doc",
      category: "plan_example",
    });
    const results = await search("matches");
    expect(results.find((r) => r.doc.id === "__seed_sentinel:v1")).toBeUndefined();
  });

  it("limit k ограничивает результаты", async () => {
    for (let i = 0; i < 10; i++) {
      await addDocument({
        id: `doc-${i}`,
        text: `запрос номер ${i}`,
        category: "plan_example",
      });
    }
    const results = await search("запрос", { k: 3 });
    expect(results.length).toBe(3);
  });
});
