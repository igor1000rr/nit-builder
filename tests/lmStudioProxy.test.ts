import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probeLmStudio, streamFromLmStudio } from "../tunnel/src/lmStudioProxy";

/**
 * Тесты для tunnel CLI proxy к LM Studio.
 *
 * Mock'аем глобальный fetch — реальный LM Studio не нужен. Проверяем:
 *  - probeLmStudio: success / HTTP error / network error / timeout
 *  - streamFromLmStudio: SSE парсинг, abort, malformed chunks, error handling
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── probeLmStudio ────────────────────────────────────────────────

describe("probeLmStudio", () => {
  it("available:true + model id при успешном ответе", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "qwen2.5-coder-7b-instruct" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await probeLmStudio("http://localhost:1234/v1");
    expect(result).toEqual({
      available: true,
      model: "qwen2.5-coder-7b-instruct",
    });
  });

  it("available:false + HTTP-код при non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await probeLmStudio("http://localhost:1234/v1");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/HTTP 404/);
  });

  it("available:false + error при network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await probeLmStudio("http://localhost:1234/v1");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("работает с baseUrl без /v1 суффикса", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "x" }] })),
    );
    globalThis.fetch = fetchMock;

    await probeLmStudio("http://localhost:1234"); // нет /v1
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/v1/models",
      expect.any(Object),
    );
  });

  it("работает с baseUrl с /v1/ суффиксом", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "x" }] })),
    );
    globalThis.fetch = fetchMock;

    await probeLmStudio("http://localhost:1234/v1/");
    // /v1 не должен дублироваться: /v1/v1/models — это была бы ошибка
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/v1/models",
      expect.any(Object),
    );
  });

  it("model:undefined если data array пустой", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] })),
    );

    const result = await probeLmStudio("http://localhost:1234/v1");
    expect(result).toEqual({ available: true, model: undefined });
  });
});

// ─── streamFromLmStudio ───────────────────────────────────────────

function makeSseStream(events: string[]): Response {
  const body = events.map((e) => `data: ${e}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamFromLmStudio", () => {
  it("yields start → text* → done в нормальном случае", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSseStream([
        JSON.stringify({ choices: [{ delta: { content: "Hello" } }] }),
        JSON.stringify({ choices: [{ delta: { content: " world" } }] }),
      ]),
    );

    const events: Array<{ type: string; text?: string; fullText?: string }> = [];
    for await (const ev of streamFromLmStudio(
      { baseUrl: "http://x/v1", model: "m", timeoutMs: 1000 },
      { system: "s", prompt: "p", maxTokens: 100, temperature: 0.5 },
    )) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types).toEqual(["start", "text", "text", "done"]);
    expect(events[1]?.text).toBe("Hello");
    expect(events[2]?.text).toBe(" world");
    expect(events[3]?.fullText).toBe("Hello world");
  });

  it("шлёт правильный POST body на /chat/completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeSseStream([]));
    globalThis.fetch = fetchMock;

    const gen = streamFromLmStudio(
      { baseUrl: "http://localhost:1234/v1", model: "qwen", timeoutMs: 5000 },
      {
        system: "you are helpful",
        prompt: "make a coffee site",
        maxTokens: 4000,
        temperature: 0.4,
      },
    );
    // Drain
    for await (const _ of gen) {
      // no-op
      void _;
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: "qwen",
      messages: [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "make a coffee site" },
      ],
      max_tokens: 4000,
      temperature: 0.4,
      stream: true,
    });
  });

  it("error event при non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const events: Array<{ type: string; error?: string }> = [];
    for await (const ev of streamFromLmStudio(
      { baseUrl: "http://x/v1", model: "m", timeoutMs: 1000 },
      { system: "s", prompt: "p", maxTokens: 100, temperature: 0.5 },
    )) {
      events.push(ev);
    }

    expect(events[0]?.type).toBe("start");
    expect(events.find((e) => e.type === "error")).toBeDefined();
    expect(events.find((e) => e.type === "error")?.error).toMatch(/LM Studio 500/);
  });

  it("malformed JSON chunks игнорируются (не валят stream)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSseStream([
        "this-is-not-json",
        JSON.stringify({ choices: [{ delta: { content: "ok" } }] }),
        "{broken",
      ]),
    );

    const texts: string[] = [];
    let doneFullText = "";
    for await (const ev of streamFromLmStudio(
      { baseUrl: "http://x/v1", model: "m", timeoutMs: 1000 },
      { system: "s", prompt: "p", maxTokens: 100, temperature: 0.5 },
    )) {
      if (ev.type === "text" && ev.text) texts.push(ev.text);
      if (ev.type === "done" && ev.fullText) doneFullText = ev.fullText;
    }

    expect(texts).toEqual(["ok"]);
    expect(doneFullText).toBe("ok");
  });

  it("AbortSignal от пользователя → error 'Request aborted'", async () => {
    // Симулируем висящий response — никогда не резолвится сам, только при abort
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, init: RequestInit) => {
        return new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
    );

    const userSignal = new AbortController();
    const events: Array<{ type: string; error?: string }> = [];

    const promise = (async () => {
      for await (const ev of streamFromLmStudio(
        { baseUrl: "http://x/v1", model: "m", timeoutMs: 60_000 },
        {
          system: "s",
          prompt: "p",
          maxTokens: 100,
          temperature: 0.5,
          signal: userSignal.signal,
        },
      )) {
        events.push(ev);
      }
    })();

    // Дадим start выйти, потом abort
    await new Promise((r) => setTimeout(r, 10));
    userSignal.abort();
    await promise;

    expect(events[0]?.type).toBe("start");
    expect(events.find((e) => e.type === "error")?.error).toMatch(/aborted/i);
  });

  it("игнорирует не-data строки в SSE (комментарии, пустые)", async () => {
    const body = ":heartbeat\n\ndata: " + JSON.stringify({
      choices: [{ delta: { content: "ok" } }],
    }) + "\n\n: another comment\n\ndata: [DONE]\n\n";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    const texts: string[] = [];
    for await (const ev of streamFromLmStudio(
      { baseUrl: "http://x/v1", model: "m", timeoutMs: 1000 },
      { system: "s", prompt: "p", maxTokens: 100, temperature: 0.5 },
    )) {
      if (ev.type === "text" && ev.text) texts.push(ev.text);
    }

    expect(texts).toEqual(["ok"]);
  });
});
