import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Мок appwrite.server чтобы не дёргать реальный Appwrite в тестах.
// `isAppwriteConfigured` и `cleanupExpiredGuestLimits` оба замокаем.
vi.mock("~/lib/server/appwrite.server", () => ({
  isAppwriteConfigured: vi.fn(() => true),
  cleanupExpiredGuestLimits: vi.fn(async () => ({
    scanned: 42,
    deleted: 38,
    batches: 1,
  })),
}));

import { action } from "~/routes/api.admin.guest-limits.cleanup";
import {
  isAppwriteConfigured,
  cleanupExpiredGuestLimits,
} from "~/lib/server/appwrite.server";

const mockedIsConfigured = isAppwriteConfigured as unknown as ReturnType<typeof vi.fn>;
const mockedCleanup = cleanupExpiredGuestLimits as unknown as ReturnType<typeof vi.fn>;

function makeReq(opts: {
  method?: string;
  authToken?: string;
} = {}): Request {
  const headers = new Headers();
  if (opts.authToken) {
    headers.set("authorization", `Bearer ${opts.authToken}`);
  }
  return new Request("http://example.com/api/admin/guest-limits/cleanup", {
    method: opts.method ?? "POST",
    headers,
  });
}

describe("POST /api/admin/guest-limits/cleanup", () => {
  beforeEach(() => {
    delete process.env.NIT_ADMIN_TOKEN;
    mockedIsConfigured.mockReturnValue(true);
    mockedCleanup.mockClear();
    mockedCleanup.mockResolvedValue({ scanned: 42, deleted: 38, batches: 1 });
  });

  afterEach(() => {
    delete process.env.NIT_ADMIN_TOKEN;
  });

  it("405 для GET (только POST разрешён)", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const res = await action({ request: makeReq({ method: "GET", authToken: "0123456789abcdef" }) });
    expect(res.status).toBe(405);
  });

  it("503 если NIT_ADMIN_TOKEN не задан (fail-safe от checkAdminToken)", async () => {
    const res = await action({ request: makeReq({ authToken: "any" }) });
    expect(res.status).toBe(503);
  });

  it("401 без admin-токена", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const res = await action({ request: makeReq() });
    expect(res.status).toBe(401);
  });

  it("401 с неверным admin-токеном", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const res = await action({ request: makeReq({ authToken: "wrongtokenwrongtoken" }) });
    expect(res.status).toBe(401);
  });

  it("503 если Appwrite не настроен (cleanup невозможен — нет коллекции)", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    mockedIsConfigured.mockReturnValue(false);
    const res = await action({ request: makeReq({ authToken: "0123456789abcdef" }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Appwrite/i);
  });

  it("200 с правильным токеном + Appwrite настроен — возвращает summary", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const res = await action({ request: makeReq({ authToken: "0123456789abcdef" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      scanned: 42,
      deleted: 38,
      batches: 1,
    });
    expect(mockedCleanup).toHaveBeenCalledTimes(1);
  });

  it("500 если cleanupExpiredGuestLimits бросает", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    mockedCleanup.mockRejectedValue(new Error("Appwrite network down"));
    const res = await action({ request: makeReq({ authToken: "0123456789abcdef" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Appwrite network down/);
  });

  it("idempotent: пустая очередь даёт 200 с deleted=0", async () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    mockedCleanup.mockResolvedValue({ scanned: 0, deleted: 0, batches: 0 });
    const res = await action({ request: makeReq({ authToken: "0123456789abcdef" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });
});
