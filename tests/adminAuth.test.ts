import { describe, it, expect, afterEach } from "vitest";
import { checkAdminToken } from "~/lib/server/adminAuth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://x/a", { headers });
}

afterEach(() => {
  delete process.env.NIT_ADMIN_TOKEN;
});

describe("checkAdminToken", () => {
  it("503 если env не выставлен", () => {
    const r = checkAdminToken(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("503 если токен короче 8 символов (защита от слабого токена)", () => {
    process.env.NIT_ADMIN_TOKEN = "short";
    const r = checkAdminToken(req({ "x-nit-admin-token": "short" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("401 без заголовка", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("401 при несовпадении", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ "x-nit-admin-token": "wrongtokenwrongtoken" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("ok при совпадении через x-nit-admin-token", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ "x-nit-admin-token": "0123456789abcdef" }));
    expect(r.ok).toBe(true);
  });

  it("ok при совпадении через Authorization: Bearer", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ authorization: "Bearer 0123456789abcdef" }));
    expect(r.ok).toBe(true);
  });

  it("Bearer case-insensitive", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ authorization: "bearer 0123456789abcdef" }));
    expect(r.ok).toBe(true);
  });

  // ─── Дополнительные регрессионные кейсы ───────────────────────

  it("401 для Authorization: Basic (не Bearer)", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ authorization: "Basic dXNlcjpwYXNz" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("x-nit-admin-token приоритетнее Authorization", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(
      req({
        "x-nit-admin-token": "0123456789abcdef",
        authorization: "Bearer wrongtokenwrongtoken",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("constant-time: токен длиннее ожидаемого = 401 (не leak длину)", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(
      req({ "x-nit-admin-token": "0123456789abcdef-extra-chars" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("constant-time: одна разная буква в токене той же длины = mismatch", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ "x-nit-admin-token": "0123456789abcdeF" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("пустой Bearer токен = 401", () => {
    process.env.NIT_ADMIN_TOKEN = "0123456789abcdef";
    const r = checkAdminToken(req({ authorization: "Bearer " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
});
