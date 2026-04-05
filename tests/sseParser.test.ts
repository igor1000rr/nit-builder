import { describe, it, expect } from "vitest";
import { parseSseStream } from "~/lib/utils/sseParser";

function makeResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("parseSseStream", () => {
  it("parses single complete event", async () => {
    const res = makeResponse(['data: {"type":"hello"}\n\n']);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "hello" }]);
  });

  it("parses multiple events in one chunk", async () => {
    const res = makeResponse([
      'data: {"type":"a"}\n\ndata: {"type":"b"}\n\ndata: {"type":"c"}\n\n',
    ]);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toHaveLength(3);
  });

  it("handles event split across chunks", async () => {
    const res = makeResponse([
      'data: {"type":"par',
      'tial","value":42}\n\n',
    ]);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "partial", value: 42 }]);
  });

  it("skips [DONE] marker", async () => {
    const res = makeResponse([
      'data: {"type":"ok"}\n\ndata: [DONE]\n\n',
    ]);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "ok" }]);
  });

  it("skips keep-alive ping lines", async () => {
    const res = makeResponse([
      ':ping\n\ndata: {"type":"real"}\n\n:ping\n\n',
    ]);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "real" }]);
  });

  it("skips malformed JSON events without breaking stream", async () => {
    const res = makeResponse([
      'data: {broken json}\n\ndata: {"type":"valid"}\n\n',
    ]);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "valid" }]);
  });

  it("propagates errors thrown in handler", async () => {
    const res = makeResponse(['data: {"type":"error","message":"fail"}\n\n']);
    await expect(
      parseSseStream(res, (e) => {
        if ((e as { type: string }).type === "error") {
          throw new Error((e as { message: string }).message);
        }
      }),
    ).rejects.toThrow("fail");
  });

  it("throws on non-ok HTTP response", async () => {
    const res = new Response("Internal Server Error", { status: 500 });
    await expect(parseSseStream(res, () => {})).rejects.toThrow(/HTTP 500/);
  });

  it("throws on missing body", async () => {
    const res = new Response(null);
    await expect(parseSseStream(res, () => {})).rejects.toThrow("Нет ответа");
  });

  it("flushes final buffer without trailing \\n\\n", async () => {
    const res = makeResponse(['data: {"type":"last"}\n\n']);
    const events: unknown[] = [];
    await parseSseStream(res, (e) => { events.push(e); });
    expect(events).toEqual([{ type: "last" }]);
  });
});
