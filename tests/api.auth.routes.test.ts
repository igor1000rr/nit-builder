import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Все Appwrite вызовы мокнуты — integration tests verify контракт route
// (валидация, статусы, headers), без реальной сетевой Appwrite зависимости.
vi.mock("~/lib/server/appwrite.server", () => ({
  registerUser: vi.fn(),
  createEmailSession: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  bumpSessionVersion: vi.fn(),
  getNitUser: vi.fn(),
  getUserById: vi.fn(),
  getUserSessionVersion: vi.fn().mockResolvedValue(0),
}));

vi.mock("~/lib/server/sessionCookie.server", () => ({
  buildSessionCookie: vi.fn(() => "nit_session=test-cookie; Path=/"),
  buildClearCookie: vi.fn(() => "nit_session=; Max-Age=0; Path=/"),
  createSessionToken: vi.fn(() => "test-token"),
  parseSessionCookie: vi.fn(),
  verifySessionToken: vi.fn(),
  isProduction: vi.fn(() => false),
}));

vi.mock("~/lib/services/tunnelRegistry.server", () => ({
  hasTunnelForUser: vi.fn(() => false),
  getTunnelCount: vi.fn(() => 0),
}));

import { action as registerAction } from "~/routes/api.auth.register";
import { action as logoutAction } from "~/routes/api.auth.logout";
import { action as logoutAllAction } from "~/routes/api.auth.logout-all";
import { loader as meLoader } from "~/routes/api.auth.me";
import {
  registerUser,
  createEmailSession,
  deleteSession,
  bumpSessionVersion,
  getNitUser,
} from "~/lib/server/appwrite.server";
import { parseSessionCookie, verifySessionToken } from "~/lib/server/sessionCookie.server";
import { _resetRateLimitState } from "~/lib/utils/rateLimit";

const mockedRegisterUser = registerUser as unknown as ReturnType<typeof vi.fn>;
const mockedCreateEmailSession = createEmailSession as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteSession = deleteSession as unknown as ReturnType<typeof vi.fn>;
const mockedBumpVersion = bumpSessionVersion as unknown as ReturnType<typeof vi.fn>;
const mockedGetNitUser = getNitUser as unknown as ReturnType<typeof vi.fn>;
const mockedParseCookie = parseSessionCookie as unknown as ReturnType<typeof vi.fn>;
const mockedVerifyToken = verifySessionToken as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedDeleteSession.mockResolvedValue(undefined);
  _resetRateLimitState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonRequest(url: string, body: unknown, opts?: { method?: string; ip?: string }): Request {
  return new Request(url, {
    method: opts?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-remote-ip": opts?.ip ?? "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

// ─── /api/auth/register ─────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("405 на не-POST", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "GET",
      headers: { "x-request-remote-ip": "10.0.0.1" },
    });
    const res = await registerAction({ request: req } as Parameters<typeof registerAction>[0]);
    expect(res.status).toBe(405);
  });

  it("400 при validation failure (короткий пароль)", async () => {
    const req = jsonRequest(
      "http://localhost/api/auth/register",
      { email: "alice@example.com", password: "short" },
      { ip: "10.0.0.2" },
    );
    const res = await registerAction({ request: req } as Parameters<typeof registerAction>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.issues?.password).toBeDefined();
  });

  it("201 + tunnelToken + Set-Cookie на успех", async () => {
    mockedRegisterUser.mockResolvedValueOnce({
      userId: "u-new",
      tunnelToken: "nit_abc123",
    });
    mockedCreateEmailSession.mockResolvedValueOnce({
      userId: "u-new",
      secret: "appwrite-secret",
    });

    const req = jsonRequest(
      "http://localhost/api/auth/register",
      { email: "new@example.com", password: "secret-1234", name: "Alice" },
      { ip: "10.0.0.3" },
    );
    const res = await registerAction({ request: req } as Parameters<typeof registerAction>[0]);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      userId: "u-new",
      email: "new@example.com",
      tunnelToken: "nit_abc123",
    });
    expect(res.headers.get("Set-Cookie")).toMatch(/nit_session=/);

    // Critical: cleanup Appwrite session (тот же fix что для login).
    expect(mockedDeleteSession).toHaveBeenCalledWith("appwrite-secret");
  });

  it("409 при попытке зарегистрировать существующий email", async () => {
    mockedRegisterUser.mockRejectedValueOnce(new Error("user_already_exists"));

    const req = jsonRequest(
      "http://localhost/api/auth/register",
      { email: "taken@example.com", password: "secret-1234" },
      { ip: "10.0.0.4" },
    );
    const res = await registerAction({ request: req } as Parameters<typeof registerAction>[0]);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/уже зарегистрирован/i);
  });

  it("rate-limit: 5 попыток с одного IP → 429 на 6-й", async () => {
    mockedRegisterUser.mockRejectedValue(new Error("user_already_exists"));

    const ip = "10.0.0.99";
    for (let i = 0; i < 5; i++) {
      const req = jsonRequest(
        "http://localhost/api/auth/register",
        { email: `u-${i}@example.com`, password: "secret-1234" },
        { ip },
      );
      const res = await registerAction({ request: req } as Parameters<typeof registerAction>[0]);
      expect(res.status).toBe(409);
    }

    const finalReq = jsonRequest(
      "http://localhost/api/auth/register",
      { email: "u-final@example.com", password: "secret-1234" },
      { ip },
    );
    const finalRes = await registerAction({ request: finalReq } as Parameters<typeof registerAction>[0]);
    expect(finalRes.status).toBe(429);
  });
});

// ─── /api/auth/logout ───────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("200 + Set-Cookie с Max-Age=0 (clear)", async () => {
    const req = jsonRequest("http://localhost/api/auth/logout", {});
    const res = await logoutAction({ request: req } as Parameters<typeof logoutAction>[0]);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });

  it("405 на GET", async () => {
    const req = new Request("http://localhost/api/auth/logout", { method: "GET" });
    const res = await logoutAction({ request: req } as Parameters<typeof logoutAction>[0]);
    expect(res.status).toBe(405);
  });
});

// ─── /api/auth/logout-all ───────────────────────────────────────────

describe("POST /api/auth/logout-all", () => {
  it("405 на GET", async () => {
    const req = new Request("http://localhost/api/auth/logout-all", {
      method: "GET",
      headers: { "x-request-remote-ip": "10.5.0.1" },
    });
    const res = await logoutAllAction({ request: req } as Parameters<typeof logoutAllAction>[0]);
    expect(res.status).toBe(405);
  });

  it("401 если нет валидной сессии", async () => {
    mockedParseCookie.mockReturnValueOnce(null);
    mockedVerifyToken.mockReturnValueOnce(null);

    const req = jsonRequest("http://localhost/api/auth/logout-all", {}, { ip: "10.5.0.2" });
    const res = await logoutAllAction({ request: req } as Parameters<typeof logoutAllAction>[0]);
    expect(res.status).toBe(401);
  });

  it("200 + bumpSessionVersion + clear cookie на успех", async () => {
    mockedParseCookie.mockReturnValue("token-xyz");
    mockedVerifyToken.mockReturnValue({ userId: "u-1", sessionVersion: 0 });
    // requireAuth.server.ts → getAuth → getUserById is mocked separately
    const { getUserById } = await import("~/lib/server/appwrite.server");
    (getUserById as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: "u-1",
      email: "alice@example.com",
    });
    mockedBumpVersion.mockResolvedValueOnce(7);

    const req = jsonRequest("http://localhost/api/auth/logout-all", {}, { ip: "10.5.0.3" });
    const res = await logoutAllAction({ request: req } as Parameters<typeof logoutAllAction>[0]);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionVersion).toBe(7);
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect(mockedBumpVersion).toHaveBeenCalledWith("u-1");
  });

  it("rate-limit: 3 запроса/мин с одного IP → 429 на 4-й", async () => {
    mockedParseCookie.mockReturnValue(null);
    mockedVerifyToken.mockReturnValue(null);

    const ip = "10.5.99.99";
    for (let i = 0; i < 3; i++) {
      const req = jsonRequest("http://localhost/api/auth/logout-all", {}, { ip });
      const res = await logoutAllAction({ request: req } as Parameters<typeof logoutAllAction>[0]);
      expect(res.status).toBe(401); // unauth, но в пределах rate-limit
    }

    const finalReq = jsonRequest("http://localhost/api/auth/logout-all", {}, { ip });
    const finalRes = await logoutAllAction({ request: finalReq } as Parameters<typeof logoutAllAction>[0]);
    expect(finalRes.status).toBe(429);
  });
});

// ─── /api/auth/me ───────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("authenticated:false если нет cookie", async () => {
    mockedParseCookie.mockReturnValueOnce(null);
    mockedVerifyToken.mockReturnValueOnce(null);

    const req = new Request("http://localhost/api/auth/me");
    const res = await meLoader({ request: req } as Parameters<typeof meLoader>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ authenticated: false });
  });

  it("authenticated:true с user info + tunnel status", async () => {
    mockedParseCookie.mockReturnValue("valid-token");
    mockedVerifyToken.mockReturnValue({ userId: "u-2", sessionVersion: 0 });
    const { getUserById } = await import("~/lib/server/appwrite.server");
    (getUserById as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: "u-2",
      email: "bob@example.com",
    });
    mockedGetNitUser.mockResolvedValueOnce({
      preferredProvider: "tunnel",
      tunnelTokenCreatedAt: "2026-04-24T10:00:00Z",
    });

    const req = new Request("http://localhost/api/auth/me", {
      headers: { Cookie: "nit_session=valid-token" },
    });
    const res = await meLoader({ request: req } as Parameters<typeof meLoader>[0]);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      authenticated: true,
      userId: "u-2",
      email: "bob@example.com",
      preferredProvider: "tunnel",
      tunnelTokenCreatedAt: "2026-04-24T10:00:00Z",
      tunnel: { status: "offline", activeTunnels: 0 },
    });
  });
});
