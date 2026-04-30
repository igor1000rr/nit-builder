import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authOrGuest, checkCsrf } from "~/lib/server/auth";
import { createHash } from "node:crypto";
import { checkRateLimit } from "~/lib/utils/rateLimit";

function makeRequest(opts: {
  method?: string;
  origin?: string;
  referer?: string;
  host?: string;
  ip?: string;
  auth?: string;
}): Request {
  const headers = new Headers();
  if (opts.host) headers.set("host", opts.host);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.referer) headers.set("referer", opts.referer);
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  if (opts.auth) headers.set("authorization", opts.auth);
  return new Request("http://example.com/api/test", {
    method: opts.method ?? "POST",
    headers,
  });
}

/** Воспроизводит deriveToken() из auth.ts — для построения валидного Bearer в тестах. */
function expectedTokenFor(secret: string): string {
  return createHash("sha256")
    .update(`nit-builder:${secret}`)
    .digest("hex")
    .slice(0, 48);
}

describe("checkCsrf", () => {
  beforeEach(() => {
    delete process.env.NIT_API_SECRET;
  });

  afterEach(() => {
    delete process.env.NIT_API_SECRET;
  });

  it("allows GET requests unconditionally", () => {
    const req = makeRequest({ method: "GET" });
    expect(checkCsrf(req)).toBeNull();
  });

  it("allows HEAD and OPTIONS", () => {
    expect(checkCsrf(makeRequest({ method: "HEAD" }))).toBeNull();
    expect(checkCsrf(makeRequest({ method: "OPTIONS" }))).toBeNull();
  });

  it("allows valid Bearer token (matches NIT_API_SECRET) even from evil origin", () => {
    const secret = "test-secret-very-long-string";
    process.env.NIT_API_SECRET = secret;
    const req = makeRequest({
      method: "POST",
      auth: `Bearer ${secret}`,
      host: "nit.by",
      origin: "http://evil.com",
    });
    expect(checkCsrf(req)).toBeNull();
  });

  it("allows valid Bearer derived token from evil origin", () => {
    const secret = "test-secret-very-long-string";
    process.env.NIT_API_SECRET = secret;
    const req = makeRequest({
      method: "POST",
      auth: `Bearer ${expectedTokenFor(secret)}`,
      host: "nit.by",
      origin: "http://evil.com",
    });
    expect(checkCsrf(req)).toBeNull();
  });

  it("BLOCKS invalid Bearer from evil origin (no silent CSRF bypass)", () => {
    // Регрессия: до фикса любой `Bearer что-угодно` обходил CSRF.
    // Сейчас — только валидный токен; невалидный продолжает CSRF-проверку.
    process.env.NIT_API_SECRET = "real-secret-very-long";
    const req = makeRequest({
      method: "POST",
      auth: "Bearer fake-attacker-token",
      host: "nit.by",
      origin: "http://evil.com",
    });
    const res = checkCsrf(req);
    expect(res?.status).toBe(403);
  });

  it("BLOCKS Bearer when NIT_API_SECRET not set (auth disabled mode)", () => {
    // Bearer должен быть проигнорирован если auth не настроен — иначе мы
    // молча пропускаем все Bearer-запросы как guest без origin-проверки.
    const req = makeRequest({
      method: "POST",
      auth: "Bearer any-token",
      host: "nit.by",
      origin: "http://evil.com",
    });
    const res = checkCsrf(req);
    expect(res?.status).toBe(403);
  });

  it("allows matching Origin", () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      origin: "https://nit.by",
    });
    expect(checkCsrf(req)).toBeNull();
  });

  it("blocks mismatched Origin with 403", () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      origin: "https://evil.com",
    });
    const res = checkCsrf(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it("falls back to Referer when Origin missing", () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      referer: "https://nit.by/some-page",
    });
    expect(checkCsrf(req)).toBeNull();
  });

  it("blocks mismatched Referer with 403", () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      referer: "https://evil.com/",
    });
    const res = checkCsrf(req);
    expect(res?.status).toBe(403);
  });

  it("allows when neither Origin nor Referer present (curl/mobile)", () => {
    const req = makeRequest({ method: "POST", host: "nit.by" });
    expect(checkCsrf(req)).toBeNull();
  });

  it("handles malformed Origin URL gracefully", () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      origin: "not-a-url",
    });
    const res = checkCsrf(req);
    expect(res?.status).toBe(403);
  });
});

describe("authOrGuest", () => {
  beforeEach(() => {
    delete process.env.NIT_API_SECRET;
  });

  afterEach(() => {
    delete process.env.NIT_API_SECRET;
  });

  it("treats anonymous requests as guests when legacy secret is not configured", async () => {
    const req = makeRequest({
      method: "POST",
      host: "nit.by",
      origin: "https://nit.by",
    });

    const result = await authOrGuest(req);
    expect(result).toMatchObject({ isGuest: true });
    expect(result.csrfError).toBeUndefined();
  });
});

describe("checkRateLimit", () => {
  it("allows first N requests from same IP", () => {
    const req = makeRequest({ ip: "192.168.1.100" });
    const results = Array.from({ length: 5 }, () =>
      checkRateLimit(req, { maxRequests: 10, scope: "test1" }),
    );
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results[4]!.remaining).toBe(5);
  });

  it("blocks after exceeding limit", () => {
    const req = makeRequest({ ip: "192.168.1.101" });
    for (let i = 0; i < 5; i++) {
      checkRateLimit(req, { maxRequests: 5, scope: "test2" });
    }
    const blocked = checkRateLimit(req, { maxRequests: 5, scope: "test2" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates different IPs", () => {
    const req1 = makeRequest({ ip: "10.0.0.1" });
    const req2 = makeRequest({ ip: "10.0.0.2" });
    for (let i = 0; i < 3; i++) {
      checkRateLimit(req1, { maxRequests: 3, scope: "test3" });
    }
    const r1 = checkRateLimit(req1, { maxRequests: 3, scope: "test3" });
    const r2 = checkRateLimit(req2, { maxRequests: 3, scope: "test3" });
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(true);
  });

  it("isolates different scopes", () => {
    const req = makeRequest({ ip: "10.0.0.50" });
    for (let i = 0; i < 3; i++) {
      checkRateLimit(req, { maxRequests: 3, scope: "scopeA" });
    }
    const blockedA = checkRateLimit(req, { maxRequests: 3, scope: "scopeA" });
    const allowedB = checkRateLimit(req, { maxRequests: 3, scope: "scopeB" });
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("reads x-forwarded-for correctly (first IP from list)", () => {
    const req = new Request("http://example.com/", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
    });
    const result = checkRateLimit(req, { maxRequests: 1, scope: "xff-test" });
    expect(result.allowed).toBe(true);
    const blocked = checkRateLimit(req, { maxRequests: 1, scope: "xff-test" });
    expect(blocked.allowed).toBe(false);
  });
});
