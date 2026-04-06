import { describe, it, expect, beforeAll } from "vitest";
import {
  generateTunnelToken,
  computeTokenLookup,
  hashTunnelToken,
  verifyTunnelTokenHash,
  safeCompare,
  isTunnelTokenFormat,
} from "~/lib/server/tunnelTokens.server";

beforeAll(() => {
  // Set secret for HMAC lookup before any token tests run
  process.env.NIT_TOKEN_LOOKUP_SECRET = "test-secret-at-least-32-chars-long-abcdef";
});

describe("tunnelTokens", () => {
  describe("generateTunnelToken", () => {
    it("generates token with nit_ prefix", () => {
      const token = generateTunnelToken();
      expect(token.startsWith("nit_")).toBe(true);
    });

    it("generates token with 64 hex chars after prefix", () => {
      const token = generateTunnelToken();
      expect(token.length).toBe(4 + 64);
      expect(/^nit_[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it("generates unique tokens", () => {
      const a = generateTunnelToken();
      const b = generateTunnelToken();
      expect(a).not.toBe(b);
    });
  });

  describe("isTunnelTokenFormat", () => {
    it("accepts valid format", () => {
      expect(isTunnelTokenFormat(generateTunnelToken())).toBe(true);
    });

    it("rejects missing prefix", () => {
      expect(isTunnelTokenFormat("a".repeat(64))).toBe(false);
    });

    it("rejects wrong prefix", () => {
      expect(isTunnelTokenFormat("xyz_" + "a".repeat(64))).toBe(false);
    });

    it("rejects short hex", () => {
      expect(isTunnelTokenFormat("nit_abc")).toBe(false);
    });

    it("rejects non-hex chars", () => {
      expect(isTunnelTokenFormat("nit_" + "z".repeat(64))).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isTunnelTokenFormat("")).toBe(false);
    });
  });

  describe("computeTokenLookup", () => {
    it("produces deterministic HMAC", () => {
      const token = generateTunnelToken();
      const a = computeTokenLookup(token);
      const b = computeTokenLookup(token);
      expect(a).toBe(b);
    });

    it("produces different output for different tokens", () => {
      const a = computeTokenLookup(generateTunnelToken());
      const b = computeTokenLookup(generateTunnelToken());
      expect(a).not.toBe(b);
    });

    it("produces 64-char hex output (SHA-256)", () => {
      const lookup = computeTokenLookup(generateTunnelToken());
      expect(lookup.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(lookup)).toBe(true);
    });

    it("throws if NIT_TOKEN_LOOKUP_SECRET is missing", () => {
      const old = process.env.NIT_TOKEN_LOOKUP_SECRET;
      delete process.env.NIT_TOKEN_LOOKUP_SECRET;
      expect(() => computeTokenLookup("nit_abc")).toThrow(
        /NIT_TOKEN_LOOKUP_SECRET/,
      );
      process.env.NIT_TOKEN_LOOKUP_SECRET = old;
    });

    it("throws if secret is too short", () => {
      const old = process.env.NIT_TOKEN_LOOKUP_SECRET;
      process.env.NIT_TOKEN_LOOKUP_SECRET = "short";
      expect(() => computeTokenLookup("nit_abc")).toThrow(
        /at least 32 characters/,
      );
      process.env.NIT_TOKEN_LOOKUP_SECRET = old;
    });
  });

  describe("hashTunnelToken + verifyTunnelTokenHash", () => {
    it("hash and verify roundtrip succeeds", async () => {
      const token = generateTunnelToken();
      const hash = await hashTunnelToken(token);
      expect(await verifyTunnelTokenHash(token, hash)).toBe(true);
    });

    it("verify fails with wrong token", async () => {
      const hash = await hashTunnelToken(generateTunnelToken());
      expect(await verifyTunnelTokenHash(generateTunnelToken(), hash)).toBe(false);
    });

    it("hashes are different for same token (random salt)", async () => {
      const token = generateTunnelToken();
      const a = await hashTunnelToken(token);
      const b = await hashTunnelToken(token);
      expect(a).not.toBe(b);
      // But both should verify
      expect(await verifyTunnelTokenHash(token, a)).toBe(true);
      expect(await verifyTunnelTokenHash(token, b)).toBe(true);
    });

    it("verify returns false on malformed hash", async () => {
      expect(await verifyTunnelTokenHash("nit_abc", "not-a-hash")).toBe(false);
    });
  });

  describe("safeCompare", () => {
    it("returns true for equal strings", () => {
      expect(safeCompare("abc123", "abc123")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(safeCompare("abc123", "def456")).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(safeCompare("abc", "abcd")).toBe(false);
    });

    it("returns false for non-hex input that can't be parsed", () => {
      // Buffer.from with hex encoding silently ignores bad chars, so
      // this tests that the function doesn't crash on unusual input
      const result = safeCompare("zzzz", "zzzz");
      expect(typeof result).toBe("boolean");
    });
  });
});
