import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAvailableProviders,
  getPreferredProvider,
  calcMaxOutput,
  checkContextBudget,
} from "~/lib/llm/client";

// Snapshot env to restore between tests
const originalEnv = { ...process.env };

describe("llm/client", () => {
  beforeEach(() => {
    // Clear LM Studio env vars for isolation
    delete process.env.LMSTUDIO_BASE_URL;
    delete process.env.LMSTUDIO_MODEL;
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe("getAvailableProviders", () => {
    it("always returns lmstudio (default URL fallback)", () => {
      const providers = getAvailableProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0]?.id).toBe("lmstudio");
    });

    it("uses default http://localhost:1234 when env not set", () => {
      const providers = getAvailableProviders();
      expect(providers[0]?.baseUrl).toBe("http://localhost:1234/v1");
    });

    it("respects custom LMSTUDIO_BASE_URL", () => {
      process.env.LMSTUDIO_BASE_URL = "http://192.168.1.5:8080";
      const providers = getAvailableProviders();
      expect(providers[0]?.baseUrl).toBe("http://192.168.1.5:8080/v1");
    });

    it("strips trailing slash from base URL", () => {
      process.env.LMSTUDIO_BASE_URL = "http://localhost:1234/";
      const providers = getAvailableProviders();
      expect(providers[0]?.baseUrl).toBe("http://localhost:1234/v1");
    });

    it("respects custom LMSTUDIO_MODEL", () => {
      process.env.LMSTUDIO_MODEL = "qwen2.5-coder-14b-instruct";
      const providers = getAvailableProviders();
      expect(providers[0]?.defaultModel).toBe("qwen2.5-coder-14b-instruct");
    });

    it("uses qwen2.5-coder-7b-instruct as default model", () => {
      const providers = getAvailableProviders();
      expect(providers[0]?.defaultModel).toBe("qwen2.5-coder-7b-instruct");
    });

    it("lmstudio has 32k context window", () => {
      const providers = getAvailableProviders();
      expect(providers[0]?.contextWindow).toBe(32_000);
    });
  });

  describe("getPreferredProvider", () => {
    it("returns lmstudio provider", () => {
      const p = getPreferredProvider();
      expect(p?.id).toBe("lmstudio");
    });

    it("applies modelName override", () => {
      const p = getPreferredProvider({ modelName: "custom-override-model" });
      expect(p?.id).toBe("lmstudio");
      expect(p?.defaultModel).toBe("custom-override-model");
    });

    it("returns base config when no override", () => {
      const p = getPreferredProvider();
      expect(p?.defaultModel).toBe("qwen2.5-coder-7b-instruct");
    });
  });

  describe("calcMaxOutput", () => {
    const provider = {
      id: "lmstudio" as const,
      baseUrl: "http://localhost:1234/v1",
      apiKey: "lm-studio",
      defaultModel: "qwen2.5-coder-7b-instruct",
      contextWindow: 32_000,
    };

    it("returns reasonable output for small input", () => {
      const result = calcMaxOutput(provider, 1000);
      expect(result).toBeGreaterThanOrEqual(2000);
      expect(result).toBeLessThanOrEqual(16000);
    });

    it("caps output at 16k", () => {
      const result = calcMaxOutput(provider, 0);
      expect(result).toBe(16000);
    });

    it("enforces minimum 2k output even for huge input", () => {
      const result = calcMaxOutput(provider, 500_000);
      expect(result).toBe(2000);
    });

    it("adapts to small context window", () => {
      const smallProvider = { ...provider, contextWindow: 8000 };
      const result = calcMaxOutput(smallProvider, 10_000);
      expect(result).toBeGreaterThanOrEqual(2000);
      expect(result).toBeLessThanOrEqual(16000);
    });

    it("returns exactly 2000 when input eats entire context", () => {
      const tinyProvider = { ...provider, contextWindow: 4000 };
      const result = calcMaxOutput(tinyProvider, 50_000);
      expect(result).toBe(2000);
    });

    it("returns valid number for realistic template case", () => {
      const estimatedInput = 10_000 + 500 + 2000;
      const result = calcMaxOutput(provider, estimatedInput);
      expect(result).toBeGreaterThan(10_000);
    });
  });

  describe("checkContextBudget", () => {
    const largeProvider = {
      id: "lmstudio" as const,
      baseUrl: "http://localhost:1234/v1",
      apiKey: "lm-studio",
      defaultModel: "qwen2.5-coder-32b",
      contextWindow: 128_000,
    };
    const smallProvider = {
      id: "lmstudio" as const,
      baseUrl: "http://localhost:1234/v1",
      apiKey: "lm-studio",
      defaultModel: "tiny-3b",
      contextWindow: 8_000,
    };

    it("passes when input fits comfortably", () => {
      const result = checkContextBudget(largeProvider, 10_000, 4000);
      expect(result.ok).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("warns at >80% context usage but still allows", () => {
      const result = checkContextBudget(smallProvider, 16_000, 2000);
      expect(result.ok).toBe(true);
      expect(result.warning).toContain("%");
    });

    it("fails when input+output exceeds context", () => {
      const result = checkContextBudget(smallProvider, 50_000, 4000);
      expect(result.ok).toBe(false);
      expect(result.warning).toContain("превышает контекст");
      expect(result.warning).toContain("YaRN");
    });

    it("returns estimated input tokens for monitoring", () => {
      const result = checkContextBudget(largeProvider, 3500, 2000);
      expect(result.estimatedInputTokens).toBe(1000); // 3500/3.5 = 1000
    });

    it("references YaRN in overflow warning (helps user fix it)", () => {
      const result = checkContextBudget(smallProvider, 100_000, 8000);
      expect(result.ok).toBe(false);
      expect(result.warning).toMatch(/YaRN|scaling/i);
    });
  });
});
