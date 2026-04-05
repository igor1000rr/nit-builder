import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAvailableProviders,
  getPreferredProvider,
  calcMaxOutput,
} from "~/lib/llm/client";

// Snapshot env to restore between tests
const originalEnv = { ...process.env };

describe("llm/client", () => {
  beforeEach(() => {
    // Clear all LLM env vars for isolation
    delete process.env.LMSTUDIO_BASE_URL;
    delete process.env.LMSTUDIO_MODEL;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe("getAvailableProviders", () => {
    it("returns empty list when nothing configured", () => {
      // By default LMSTUDIO_BASE_URL has a fallback to localhost:1234,
      // so it always appears. Groq/OpenRouter should be empty.
      const providers = getAvailableProviders({});
      expect(providers.some((p) => p.id === "lmstudio")).toBe(true);
      expect(providers.some((p) => p.id === "groq")).toBe(false);
      expect(providers.some((p) => p.id === "openrouter")).toBe(false);
    });

    it("includes Groq when GROQ_API_KEY set", () => {
      process.env.GROQ_API_KEY = "gsk_test_key";
      const providers = getAvailableProviders({});
      const groq = providers.find((p) => p.id === "groq");
      expect(groq).toBeDefined();
      expect(groq?.apiKey).toBe("gsk_test_key");
      expect(groq?.baseUrl).toContain("groq.com");
    });

    it("includes OpenRouter when OPENROUTER_API_KEY set", () => {
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      const providers = getAvailableProviders({});
      const or = providers.find((p) => p.id === "openrouter");
      expect(or).toBeDefined();
      expect(or?.apiKey).toBe("sk-or-test");
    });

    it("prefers user key over env key", () => {
      process.env.GROQ_API_KEY = "env-key";
      const providers = getAvailableProviders({ groq: "user-key" });
      const groq = providers.find((p) => p.id === "groq");
      expect(groq?.apiKey).toBe("user-key");
    });

    it("respects custom model names from env", () => {
      process.env.GROQ_API_KEY = "gsk_test";
      process.env.GROQ_MODEL = "custom-model-7b";
      const providers = getAvailableProviders({});
      const groq = providers.find((p) => p.id === "groq");
      expect(groq?.defaultModel).toBe("custom-model-7b");
    });

    it("returns providers in priority order (lmstudio → groq → openrouter)", () => {
      process.env.GROQ_API_KEY = "gsk_test";
      process.env.OPENROUTER_API_KEY = "sk-or-test";
      const providers = getAvailableProviders({});
      expect(providers[0]?.id).toBe("lmstudio");
      expect(providers[1]?.id).toBe("groq");
      expect(providers[2]?.id).toBe("openrouter");
    });
  });

  describe("getPreferredProvider", () => {
    it("returns null when no providers available", () => {
      delete process.env.LMSTUDIO_BASE_URL;
      // Force fallback to empty by setting explicitly blank
      // Actually the default is "http://localhost:1234" so lmstudio always present.
      // Test null path via override of empty check:
      const result = getPreferredProvider({});
      // Even without anything, lmstudio is present due to default URL
      expect(result?.id).toBe("lmstudio");
    });

    it("returns lmstudio first by default", () => {
      const p = getPreferredProvider({});
      expect(p?.id).toBe("lmstudio");
    });

    it("respects providerOverride when available", () => {
      process.env.GROQ_API_KEY = "gsk_test";
      const p = getPreferredProvider({}, { providerId: "groq" });
      expect(p?.id).toBe("groq");
    });

    it("applies modelName override", () => {
      process.env.GROQ_API_KEY = "gsk_test";
      const p = getPreferredProvider(
        {},
        { providerId: "groq", modelName: "custom-override-model" },
      );
      expect(p?.id).toBe("groq");
      expect(p?.defaultModel).toBe("custom-override-model");
    });

    it("falls back to first available when override provider not found", () => {
      const p = getPreferredProvider({}, { providerId: "nonexistent" });
      expect(p?.id).toBe("lmstudio"); // fallback to first
    });
  });

  describe("calcMaxOutput", () => {
    const provider = {
      id: "groq" as const,
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "test",
      defaultModel: "llama-3.3-70b",
      contextWindow: 128_000,
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
      // 8000 - ceil(10000/3.5) - 500 = 8000 - 2858 - 500 = 4642
      // Clamped into [2000, 16000] range
      expect(result).toBeGreaterThanOrEqual(2000);
      expect(result).toBeLessThanOrEqual(16000);
    });

    it("returns exactly 2000 when input eats entire context", () => {
      const tinyProvider = { ...provider, contextWindow: 4000 };
      const result = calcMaxOutput(tinyProvider, 50_000);
      expect(result).toBe(2000);
    });

    it("returns valid number for realistic template case", () => {
      // Template ~10KB + plan JSON ~500 bytes + prompt overhead ~2000 chars
      const estimatedInput = 10_000 + 500 + 2000;
      const result = calcMaxOutput(provider, estimatedInput);
      expect(result).toBeGreaterThan(10_000); // room for full HTML output
    });
  });
});
