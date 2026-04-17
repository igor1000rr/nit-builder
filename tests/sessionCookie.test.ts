/**
 * Session cookie token format tests.
 *
 * Проверяет что:
 * - Новый 4-частный формат (userId.version.expiry.hmac) создаётся
 *   и верифицируется корректно.
 * - Старые 3-частные токены (legacy, до ревокации) продолжают
 *   валидироваться с sessionVersion=0 — нужно для zero-downtime deploy.
 * - Невалидные токены (tampered HMAC, протухшие, кривой формат)
 *   возвращают null.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Нужен стабильный secret для создания + verify. 32+ char.
const TEST_SECRET = "test-session-secret-" + "a".repeat(32);
let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.NIT_TOKEN_LOOKUP_SECRET;
  process.env.NIT_TOKEN_LOOKUP_SECRET = TEST_SECRET;
});

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.NIT_TOKEN_LOOKUP_SECRET;
  } else {
    process.env.NIT_TOKEN_LOOKUP_SECRET = originalSecret;
  }
});

describe("sessionCookie token format", () => {
  it("createSessionToken создаёт 4-частный формат userId.version.expiry.hmac", async () => {
    const { createSessionToken } = await import("~/lib/server/sessionCookie.server");
    const token = createSessionToken("user_abc", 5);
    const parts = token.split(".");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("user_abc");
    expect(parts[1]).toBe("5");
  });

  it("verifySessionToken принимает валидный v2 токен и возвращает userId + version", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "~/lib/server/sessionCookie.server"
    );
    const token = createSessionToken("user_xyz", 42);
    const result = verifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user_xyz");
    expect(result?.sessionVersion).toBe(42);
  });

  it("verifySessionToken принимает legacy 3-частный токен с version=0", async () => {
    const { verifySessionToken } = await import("~/lib/server/sessionCookie.server");
    const { createHmac } = await import("node:crypto");

    // Руководство v1-токена как он выдавался раньше: userId.expiry.hmac
    const userId = "legacy_user";
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const payload = `${userId}.${expiry}`;
    const signature = createHmac("sha256", TEST_SECRET).update(payload).digest("hex");
    const legacyToken = `${payload}.${signature}`;

    const result = verifySessionToken(legacyToken);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("legacy_user");
    expect(result?.sessionVersion).toBe(0);
  });

  it("отвергает tampered signature (v2)", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "~/lib/server/sessionCookie.server"
    );
    const token = createSessionToken("user_t", 0);
    const parts = token.split(".");
    parts[3] = "deadbeef" + parts[3]!.slice(8);
    const tampered = parts.join(".");
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("отвергает tampered version (v2) — подпись не совпадёт", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "~/lib/server/sessionCookie.server"
    );
    const token = createSessionToken("user_t2", 5);
    const parts = token.split(".");
    parts[1] = "999"; // меняем version — HMAC станет невалидным
    const tampered = parts.join(".");
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("отвергает просроченный токен", async () => {
    const { verifySessionToken } = await import("~/lib/server/sessionCookie.server");
    const { createHmac } = await import("node:crypto");

    const userId = "expired";
    const expiry = Math.floor(Date.now() / 1000) - 100; // в прошлом
    const payload = `${userId}.0.${expiry}`;
    const signature = createHmac("sha256", TEST_SECRET).update(payload).digest("hex");
    const token = `${payload}.${signature}`;
    expect(verifySessionToken(token)).toBeNull();
  });

  it("отвергает кривой формат (2 части или 5)", async () => {
    const { verifySessionToken } = await import("~/lib/server/sessionCookie.server");
    expect(verifySessionToken("just.two")).toBeNull();
    expect(verifySessionToken("a.b.c.d.e")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("single")).toBeNull();
  });

  it("отвергает negative или non-numeric version", async () => {
    const { verifySessionToken } = await import("~/lib/server/sessionCookie.server");
    const { createHmac } = await import("node:crypto");
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    for (const badVersion of ["-1", "abc", "1.5", "NaN"]) {
      const payload = `user.${badVersion}.${expiry}`;
      const signature = createHmac("sha256", TEST_SECRET).update(payload).digest("hex");
      const token = `${payload}.${signature}`;
      expect(verifySessionToken(token)).toBeNull();
    }
  });

  it("sessionVersion=0 валидна (дефолт для новых юзеров)", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "~/lib/server/sessionCookie.server"
    );
    const token = createSessionToken("user_default");
    const result = verifySessionToken(token);
    expect(result?.userId).toBe("user_default");
    expect(result?.sessionVersion).toBe(0);
  });
});
