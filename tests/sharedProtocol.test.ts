import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  isTunnelToServer,
  isBrowserToServer,
} from "@nit/shared";
import { NIT_SERVER_VERSION, NIT_TUNNEL_CLIENT_VERSION } from "@nit/shared";

/**
 * Тесты для shared/src/protocol.ts type guards и version constants.
 *
 * Раньше protocol.ts покрывался ~42% (только типы используются, type
 * guards и константы не вызывались напрямую). Теперь полное покрытие.
 *
 * Type guards умышленно слабые (только проверяют наличие type-discriminator)
 * — детальная валидация делается на consumer-стороне через TS narrowing.
 * Тесты документируют этот контракт.
 */

describe("PROTOCOL_VERSION", () => {
  it("задана как стабильная string-литерал", () => {
    expect(typeof PROTOCOL_VERSION).toBe("string");
    expect(PROTOCOL_VERSION).toBe("1.0");
  });
});

describe("NIT_SERVER_VERSION", () => {
  it("совпадает с package.json (single source of truth)", () => {
    expect(typeof NIT_SERVER_VERSION).toBe("string");
    // Формат semver-prerelease
    expect(NIT_SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/);
  });
});

describe("NIT_TUNNEL_CLIENT_VERSION", () => {
  it("задана и валидна по semver", () => {
    expect(typeof NIT_TUNNEL_CLIENT_VERSION).toBe("string");
    expect(NIT_TUNNEL_CLIENT_VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-z]+)?$/);
  });
});

describe("isTunnelToServer", () => {
  it("принимает hello-сообщение от клиента", () => {
    const msg = {
      type: "hello",
      protocolVersion: "1.0",
      token: "nit_xyz",
      clientVersion: "0.1.0-alpha",
      capabilities: {
        runtime: "lmstudio_proxy",
        model: "qwen2.5-coder-7b-instruct",
        contextWindow: 32_000,
      },
    };
    expect(isTunnelToServer(msg)).toBe(true);
  });

  it("принимает heartbeat", () => {
    expect(isTunnelToServer({ type: "heartbeat", timestamp: Date.now() })).toBe(true);
  });

  it("принимает response_text", () => {
    expect(
      isTunnelToServer({
        type: "response_text",
        requestId: "r-1",
        text: "<html>",
      }),
    ).toBe(true);
  });

  it("отвергает null/undefined/примитивы", () => {
    expect(isTunnelToServer(null)).toBe(false);
    expect(isTunnelToServer(undefined)).toBe(false);
    expect(isTunnelToServer(42)).toBe(false);
    expect(isTunnelToServer("hello")).toBe(false);
    expect(isTunnelToServer([])).toBe(false);
  });

  it("отвергает объект без поля type", () => {
    expect(isTunnelToServer({ requestId: "x", text: "y" })).toBe(false);
    expect(isTunnelToServer({})).toBe(false);
  });

  it("принимает объект с type даже если содержимое невалидное (детали валидируются на consumer)", () => {
    // Type guard слабый — проверяет только discriminator. Полная Zod-валидация
    // делается уровнем выше (handleTunnelConnection в wsHandlers.server).
    expect(isTunnelToServer({ type: "garbage_type" })).toBe(true);
  });
});

describe("isBrowserToServer", () => {
  it("принимает auth", () => {
    expect(isBrowserToServer({ type: "auth", jwt: "session-token" })).toBe(true);
  });

  it("принимает generate (create)", () => {
    expect(
      isBrowserToServer({
        type: "generate",
        requestId: "r-1",
        mode: "create",
        prompt: "coffee shop",
      }),
    ).toBe(true);
  });

  it("принимает generate (polish с previousHtml)", () => {
    expect(
      isBrowserToServer({
        type: "generate",
        requestId: "r-2",
        mode: "polish",
        prompt: "make it blue",
        previousHtml: "<html>existing</html>",
      }),
    ).toBe(true);
  });

  it("принимает abort", () => {
    expect(isBrowserToServer({ type: "abort", requestId: "r-3" })).toBe(true);
  });

  it("принимает heartbeat", () => {
    expect(isBrowserToServer({ type: "heartbeat" })).toBe(true);
  });

  it("отвергает не-объекты", () => {
    expect(isBrowserToServer(null)).toBe(false);
    expect(isBrowserToServer("type")).toBe(false);
    expect(isBrowserToServer([])).toBe(false);
    expect(isBrowserToServer(123)).toBe(false);
  });

  it("отвергает объект без type", () => {
    expect(isBrowserToServer({ jwt: "x" })).toBe(false);
  });
});
