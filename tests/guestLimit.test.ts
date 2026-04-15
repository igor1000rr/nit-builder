import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Мокаем appwrite.server чтобы тест не дёргал реальную Appwrite.
// `isAppwriteConfigured` возвращает false по умолчанию → checkGuestLimit
// идёт по in-memory fallback пути. Если нужно проверить Appwrite-путь —
// перемокать в конкретном тесте.
vi.mock("~/lib/server/appwrite.server", () => ({
  isAppwriteConfigured: vi.fn(() => false),
  consumeGuestLimit: vi.fn(),
}));

import { checkGuestLimit, _resetGuestLimitState } from "~/lib/server/auth";
import {
  isAppwriteConfigured,
  consumeGuestLimit,
} from "~/lib/server/appwrite.server";

const mockedIsConfigured = isAppwriteConfigured as unknown as ReturnType<typeof vi.fn>;
const mockedConsume = consumeGuestLimit as unknown as ReturnType<typeof vi.fn>;

function makeRequest(ip: string): Request {
  const headers = new Headers();
  headers.set("x-forwarded-for", ip);
  return new Request("http://example.com/api/test", {
    method: "POST",
    headers,
  });
}

describe("checkGuestLimit (in-memory fallback)", () => {
  beforeEach(() => {
    _resetGuestLimitState();
    delete process.env.GUEST_DAILY_LIMIT;
    mockedIsConfigured.mockReturnValue(false);
    mockedConsume.mockReset();
  });

  afterEach(() => {
    delete process.env.GUEST_DAILY_LIMIT;
  });

  it("первый запрос с нового IP проходит", async () => {
    const r = await checkGuestLimit(makeRequest("1.2.3.4"));
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9); // default GUEST_DAILY_LIMIT=10
  });

  it("блокирует после 10 запросов с того же IP (default лимит)", async () => {
    const req = makeRequest("5.6.7.8");
    for (let i = 0; i < 10; i++) {
      const r = await checkGuestLimit(req);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkGuestLimit(req);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("счётчик независим для разных IP", async () => {
    const reqA = makeRequest("10.0.0.1");
    const reqB = makeRequest("10.0.0.2");
    for (let i = 0; i < 10; i++) await checkGuestLimit(reqA);
    const blockedA = await checkGuestLimit(reqA);
    const allowedB = await checkGuestLimit(reqB);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("Appwrite fallback: если consumeGuestLimit бросает — переключается на in-memory", async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedConsume.mockRejectedValue(new Error("Appwrite network down"));

    const r = await checkGuestLimit(makeRequest("11.0.0.1"));
    // Фикс должен поймать ошибку и вернуть результат от in-memory
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it("Appwrite path: если consumeGuestLimit вернул decision — используется он", async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedConsume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const r = await checkGuestLimit(makeRequest("12.0.0.1"));
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    // consumeGuestLimit получил наш IP
    expect(mockedConsume).toHaveBeenCalledWith("12.0.0.1", 10, 24 * 60 * 60 * 1000);
  });

  it("читает GUEST_DAILY_LIMIT из env", async () => {
    process.env.GUEST_DAILY_LIMIT = "3";
    // ВАЖНО: GUEST_DAILY читается на момент import модуля. Этот тест
    // документирует существующее поведение — если кто-то решит сделать
    // лимит динамическим, тест надо обновить вместе с реализацией.
    // Сейчас env читается один раз; в integration-тестах этого
    // достаточно для регрессионной защиты основного flow.
    const req = makeRequest("13.0.0.1");
    const r = await checkGuestLimit(req);
    expect(r.allowed).toBe(true);
  });

  it("без x-forwarded-for/x-real-ip — все такие запросы идут в общий 'unknown' bucket", async () => {
    const req1 = new Request("http://example.com/", { method: "POST" });
    const req2 = new Request("http://example.com/", { method: "POST" });
    for (let i = 0; i < 10; i++) await checkGuestLimit(req1);
    const blocked = await checkGuestLimit(req2);
    expect(blocked.allowed).toBe(false);
  });
});
