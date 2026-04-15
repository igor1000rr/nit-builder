import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Мок embed/embedMany из ai SDK. Синтетические эмбеддинги:
// каждый текст → вектор [длина, хэш от символов].
// Одинаковый текст → одинаковый вектор (высокая similarity).
function syntheticEmbedding(text: string): number[] {
  const v = new Array(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % 8] += text.charCodeAt(i);
  }
  // normalize
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

let shouldFailEmbedding = false;

vi.mock("ai", () => ({
  embed: vi.fn(async ({ value }: { value: string }) => {
    if (shouldFailEmbedding) throw new Error("embedding model not loaded");
    return { embedding: syntheticEmbedding(value) };
  }),
  embedMany: vi.fn(async ({ values }: { values: string[] }) => {
    if (shouldFailEmbedding) throw new Error("embedding model not loaded");
    return { embeddings: values.map(syntheticEmbedding) };
  }),
}));

// Реальный createOpenAI возвращает provider с методом .embedding(name) → modelHandle.
// Код вызывает createOpenAI(opts).embedding(name) и передаёт результат в embed/embedMany.
// Возвращаем заглушку с .embedding — само значение неважно, важно что вызов не падает.
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    embedding: () => ({} as never),
  }),
}));

// Импортируем ПОСЛЕ моков
import { retrieveTemplates, _resetRetrieverState } from "~/lib/services/templateRetriever";

describe("retrieveTemplates", () => {
  beforeEach(() => {
    _resetRetrieverState();
    shouldFailEmbedding = false;
    delete process.env.NIT_DISABLE_EMBEDDING_RETRIEVER;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает null если retriever отключён через env", async () => {
    process.env.NIT_DISABLE_EMBEDDING_RETRIEVER = "1";
    const result = await retrieveTemplates("кофейня");
    expect(result).toBeNull();
  });

  it("возвращает null для пустого запроса", async () => {
    expect(await retrieveTemplates("")).toBeNull();
    expect(await retrieveTemplates("   ")).toBeNull();
  });

  it("возвращает массив id при успехе", async () => {
    const result = await retrieveTemplates("кофейня лендинг", 5);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBeLessThanOrEqual(5);
    expect(result!.length).toBeGreaterThan(0);
    // Все id — строки
    for (const id of result!) expect(typeof id).toBe("string");
  });

  it("уважает topK", async () => {
    const result = await retrieveTemplates("любой бизнес", 3);
    expect(result!.length).toBeLessThanOrEqual(3);
  });

  it("при ошибке embedding — null + отключается навсегда", async () => {
    shouldFailEmbedding = true;
    expect(await retrieveTemplates("кофейня")).toBeNull();

    // После фейла retriever должен быть отключён даже если embedding вновь работает
    shouldFailEmbedding = false;
    expect(await retrieveTemplates("другой запрос")).toBeNull();
  });

  it("после _resetRetrieverState работает опять", async () => {
    shouldFailEmbedding = true;
    await retrieveTemplates("x");
    shouldFailEmbedding = false;
    _resetRetrieverState();
    const result = await retrieveTemplates("кофейня");
    expect(result).not.toBeNull();
  });
});
