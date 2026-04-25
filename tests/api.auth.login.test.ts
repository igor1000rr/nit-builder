import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock'аем appwrite.server до import самого route — auth.login.ts
// зовёт createEmailSession/deleteSession/getUserSessionVersion из appwrite.server.
vi.mock("~/lib/server/appwrite.server", () => ({
  createEmailSession: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  getUserSessionVersion: vi.fn().mockResolvedValue(0),
}));

// Mock sessionCookie чтобы не требовать NIT_TOKEN_LOOKUP_SECRET в env.
vi.mock("~/lib/server/sessionCookie.server", () => ({
  buildSessionCookie: vi.fn(() => "nit_session=test-cookie; Path=/"),
  createSessionToken: vi.fn(() => "test-session-token"),
  isProduction: vi.fn(() => false),
}));

import { action } from "~/routes/api.auth.login";
import {
  createEmailSession,
  deleteSession,
  getUserSessionVersion,
} from "~/lib/server/appwrite.server";
import { _resetRateLimitState } from "~/lib/utils/rateLimit";

const mockedCreateEmailSession = createEmailSession as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteSession = deleteSession as unknown as ReturnType<typeof vi.fn>;
const mockedGetVersion = getUserSessionVersion as unknown as ReturnType<typeof vi.fn>;

function makePostRequest(body: unknown, opts?: { ip?: string }): Request {
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-request-remote-ip": opts?.ip ?? "127.0.0.1",
  });
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "GET",
    headers: { "x-request-remote-ip": "127.0.0.1" },
  });
}

beforeEach(() => {
  mockedCreateEmailSession.mockReset();
  mockedDeleteSession.mockReset().mockResolvedValue(undefined);
  mockedGetVersion.mockReset().mockResolvedValue(0);
  // Rate-limit / per-email lockout — оба через checkRateLimit с in-memory
  // Map, который persistent между тестами. Сброс обязателен иначе тесты
  // взаимно зависимы.
  _resetRateLimitState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/login", () => {
  it("405 на не-POST методы", async () => {
    const req = makeGetRequest();
    const res = await action({ request: req } as Parameters<typeof action>[0]);
    expect(res.status).toBe(405);
  });

  it("400 на невалидный JSON body", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-remote-ip": "10.1.1.1",
      },
      body: "not json",
    });
    const res = await action({ request: req } as Parameters<typeof action>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid JSON/i);
  });

  it("400 при validation failure (короткий пароль / битый email)", async () => {
    const req = makePostRequest({ email: "not-email", password: "" }, { ip: "10.1.1.2" });
    const res = await action({ request: req } as Parameters<typeof action>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Validation failed/i);
    expect(data.issues).toBeDefined();
  });

  it("успешный логин: 200 + Set-Cookie + cleanup Appwrite сессии", async () => {
    mockedCreateEmailSession.mockResolvedValueOnce({
      userId: "user-1",
      secret: "appwrite-secret-xyz",
    });

    const req = makePostRequest(
      { email: "alice@example.com", password: "secret-1234" },
      { ip: "10.2.0.1" },
    );
    const res = await action({ request: req } as Parameters<typeof action>[0]);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ userId: "user-1", email: "alice@example.com" });
    expect(res.headers.get("Set-Cookie")).toMatch(/nit_session=/);

    expect(mockedCreateEmailSession).toHaveBeenCalledWith("alice@example.com", "secret-1234");
    // Critical: deleteSession должен быть вызван (fire-and-forget) с secret
    // от Appwrite — иначе session leak (см. fix a3f225e в CHANGELOG).
    expect(mockedDeleteSession).toHaveBeenCalledWith("appwrite-secret-xyz");
  });

  it("401 при INVALID_CREDENTIALS (никаких leakов какой именно email/password неверный)", async () => {
    mockedCreateEmailSession.mockRejectedValueOnce(new Error("INVALID_CREDENTIALS"));

    const req = makePostRequest(
      { email: "wrong@example.com", password: "wrong-pass" },
      { ip: "10.2.0.2" },
    );
    const res = await action({ request: req } as Parameters<typeof action>[0]);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/Неверный email или пароль/i);
    // deleteSession НЕ должен вызываться при invalid credentials (createEmailSession упал)
    expect(mockedDeleteSession).not.toHaveBeenCalled();
  });

  it("503 если Appwrite не настроен (APPWRITE_API_KEY)", async () => {
    mockedCreateEmailSession.mockRejectedValueOnce(
      new Error("APPWRITE_API_KEY env variable is not set."),
    );

    const req = makePostRequest(
      { email: "alice@example.com", password: "secret-1234" },
      { ip: "10.2.0.3" },
    );
    const res = await action({ request: req } as Parameters<typeof action>[0]);

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/i);
  });

  it("per-email lockout: 5 попыток с одним email → 429 на 6-й (даже с разных IP)", async () => {
    // Все 5 первых попыток — invalid creds, но в пределах rate-limit.
    mockedCreateEmailSession.mockRejectedValue(new Error("INVALID_CREDENTIALS"));

    const email = "victim@example.com";
    // Каждый раз новый IP — обходим IP rate-limit (10/min/IP), проверяем
    // именно per-email lockout (5/15min на email).
    for (let i = 0; i < 5; i++) {
      const req = makePostRequest(
        { email, password: `wrong-${i}` },
        { ip: `192.0.2.${10 + i}` },
      );
      const res = await action({ request: req } as Parameters<typeof action>[0]);
      expect(res.status).toBe(401);
    }

    // 6-я попытка — должна быть заблочена per-email lockout, а не 401.
    const finalReq = makePostRequest(
      { email, password: "wrong-final" },
      { ip: "192.0.2.50" },
    );
    const finalRes = await action({ request: finalReq } as Parameters<typeof action>[0]);
    expect(finalRes.status).toBe(429);
    const data = await finalRes.json();
    expect(data.error).toMatch(/Too many failed attempts for this account/i);
    expect(finalRes.headers.get("Retry-After")).toBeTruthy();
  });

  it("IP rate-limit: 10 попыток с одного IP → 429 на 11-й", async () => {
    mockedCreateEmailSession.mockRejectedValue(new Error("INVALID_CREDENTIALS"));

    const ip = "203.0.113.7";
    // Каждый раз другой email — обходим per-email lockout, проверяем IP-limit.
    for (let i = 0; i < 10; i++) {
      const req = makePostRequest(
        { email: `user-${i}@example.com`, password: "x" },
        { ip },
      );
      const res = await action({ request: req } as Parameters<typeof action>[0]);
      expect(res.status).toBe(401);
    }

    const finalReq = makePostRequest(
      { email: "user-final@example.com", password: "x" },
      { ip },
    );
    const finalRes = await action({ request: finalReq } as Parameters<typeof action>[0]);
    expect(finalRes.status).toBe(429);
    const data = await finalRes.json();
    expect(data.error).toMatch(/Too many login attempts/i);
  });

  it("email нормализуется case-insensitively для lockout (Foo@bar == foo@bar)", async () => {
    mockedCreateEmailSession.mockRejectedValue(new Error("INVALID_CREDENTIALS"));

    // 5 попыток с UPPER-CASE email
    for (let i = 0; i < 5; i++) {
      const req = makePostRequest(
        { email: "VICTIM2@example.com", password: "x" },
        { ip: `198.51.100.${10 + i}` },
      );
      await action({ request: req } as Parameters<typeof action>[0]);
    }

    // 6-я с lower-case того же email — должна быть locked (нормализация работает)
    const finalReq = makePostRequest(
      { email: "victim2@example.com", password: "x" },
      { ip: "198.51.100.50" },
    );
    const finalRes = await action({ request: finalReq } as Parameters<typeof action>[0]);
    expect(finalRes.status).toBe(429);
  });
});
