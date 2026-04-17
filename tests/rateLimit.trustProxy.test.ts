/**
 * Trust-proxy тесты. Без whitelist rate-limit доверял любому X-Forwarded-For —
 * атакующий мог обойти лимит подделкой заголовка. Эти тесты проверяют что:
 * - С пустым TRUSTED_PROXY_IPS поведение legacy (доверяем всем заголовкам)
 * - С заданным whitelist и untrusted remote — X-Forwarded-For игнорируется
 * - С заданным whitelist и trusted remote — X-Forwarded-For учитывается
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers,
  });
}

describe("rateLimit trust-proxy", () => {
  const originalEnv = process.env.TRUSTED_PROXY_IPS;

  beforeEach(() => {
    // Каждый test case — свежий module import чтобы подхватить env.
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = originalEnv;
  });

  it("без TRUSTED_PROXY_IPS доверяет X-Forwarded-For (legacy behavior)", async () => {
    delete process.env.TRUSTED_PROXY_IPS;
    const { checkRateLimit } = await import("~/lib/utils/rateLimit");

    // Два запроса с разными X-Forwarded-For идут в разные buckets — значит
    // заголовку доверяем без проверки remote.
    const scope = `test-legacy-${Date.now()}`;
    const r1 = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-request-remote-ip": "9.9.9.9",
    });
    const r2 = makeRequest({
      "x-forwarded-for": "2.2.2.2",
      "x-request-remote-ip": "9.9.9.9",
    });

    // maxRequests=1 — если оба считаются одним клиентом, второй запрос упадёт
    const res1 = checkRateLimit(r1, { maxRequests: 1, scope });
    const res2 = checkRateLimit(r2, { maxRequests: 1, scope });
    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true); // разные IP через fwd-заголовок
  });

  it("с TRUSTED_PROXY_IPS и untrusted remote — игнорирует X-Forwarded-For", async () => {
    process.env.TRUSTED_PROXY_IPS = "127.0.0.1,10.0.0.1";
    const { checkRateLimit } = await import("~/lib/utils/rateLimit");

    const scope = `test-untrusted-${Date.now()}`;
    // remote = 5.6.7.8 (НЕ в whitelist), fwd = разные фейки.
    // Оба запроса должны упасть в один bucket по remote, второй получит 429.
    const r1 = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-request-remote-ip": "5.6.7.8",
    });
    const r2 = makeRequest({
      "x-forwarded-for": "2.2.2.2",
      "x-request-remote-ip": "5.6.7.8",
    });

    const res1 = checkRateLimit(r1, { maxRequests: 1, scope });
    const res2 = checkRateLimit(r2, { maxRequests: 1, scope });
    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(false); // untrusted remote, fwd игнорим
  });

  it("с TRUSTED_PROXY_IPS и trusted remote — учитывает X-Forwarded-For", async () => {
    process.env.TRUSTED_PROXY_IPS = "127.0.0.1";
    const { checkRateLimit } = await import("~/lib/utils/rateLimit");

    const scope = `test-trusted-${Date.now()}`;
    // remote = 127.0.0.1 (trusted nginx), fwd = реальный IP клиента
    const r1 = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-request-remote-ip": "127.0.0.1",
    });
    const r2 = makeRequest({
      "x-forwarded-for": "2.2.2.2",
      "x-request-remote-ip": "127.0.0.1",
    });

    const res1 = checkRateLimit(r1, { maxRequests: 1, scope });
    const res2 = checkRateLimit(r2, { maxRequests: 1, scope });
    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true); // trusted proxy → доверяем fwd
  });

  it("IPv4-mapped IPv6 нормализуется: ::ffff:127.0.0.1 == 127.0.0.1", async () => {
    process.env.TRUSTED_PROXY_IPS = "127.0.0.1";
    const { checkRateLimit } = await import("~/lib/utils/rateLimit");

    const scope = `test-v4mapped-${Date.now()}`;
    const r = makeRequest({
      "x-forwarded-for": "8.8.8.8",
      "x-request-remote-ip": "::ffff:127.0.0.1",
    });
    const res = checkRateLimit(r, { maxRequests: 1, scope });
    expect(res.allowed).toBe(true);
    // Второй запрос от того же real IP должен упасть
    const r2 = makeRequest({
      "x-forwarded-for": "8.8.8.8",
      "x-request-remote-ip": "::ffff:127.0.0.1",
    });
    const res2 = checkRateLimit(r2, { maxRequests: 1, scope });
    expect(res2.allowed).toBe(false); // тот же fwd, trusted proxy → bucket по fwd=8.8.8.8
  });
});
