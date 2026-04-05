import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ProviderId = "lmstudio" | "groq" | "openrouter" | "custom";

export type ProviderConfig = {
  id: ProviderId;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindow: number;
};

/**
 * Порядок приоритета провайдеров:
 * 1. LM Studio (локально, бесплатно) — если доступен
 * 2. Groq (облако, бесплатно) — быстрый fallback
 * 3. OpenRouter — платный, для продвинутых
 */
export function getAvailableProviders(userKeys: Record<string, string> = {}): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const lmStudioUrl = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234";
  if (lmStudioUrl) {
    providers.push({
      id: "lmstudio",
      baseUrl: `${lmStudioUrl.replace(/\/$/, "")}/v1`,
      apiKey: "lm-studio",
      defaultModel: process.env.LMSTUDIO_MODEL ?? "qwen2.5-coder-7b-instruct",
      contextWindow: 32_000,
    });
  }

  const groqKey = userKeys.groq ?? process.env.GROQ_API_KEY;
  if (groqKey) {
    providers.push({
      id: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      defaultModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      contextWindow: 128_000,
    });
  }

  const orKey = userKeys.openrouter ?? process.env.OPENROUTER_API_KEY;
  if (orKey) {
    providers.push({
      id: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: orKey,
      defaultModel: process.env.OPENROUTER_MODEL ?? "qwen/qwen-2.5-coder-32b-instruct",
      contextWindow: 32_000,
    });
  }

  return providers;
}

export function getPreferredProvider(
  userKeys: Record<string, string> = {},
  override?: { providerId?: string; modelName?: string },
): ProviderConfig | null {
  const all = getAvailableProviders(userKeys);
  if (!all.length) return null;

  if (override?.providerId) {
    const found = all.find((p) => p.id === override.providerId);
    if (found) {
      return override.modelName ? { ...found, defaultModel: override.modelName } : found;
    }
  }
  return all[0]!;
}

export function getModel(provider: ProviderConfig): LanguageModel {
  const client = createOpenAI({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
  });
  return client(provider.defaultModel);
}

/** Эвристика лимита output токенов — оставляем запас для input */
export function calcMaxOutput(provider: ProviderConfig, estimatedInputChars: number): number {
  const estimatedInputTokens = Math.ceil(estimatedInputChars / 3.5);
  const available = provider.contextWindow - estimatedInputTokens - 500;
  return Math.max(2000, Math.min(16000, available));
}

/**
 * Проверка переполнения контекстного окна.
 * Возвращает предупреждение если input + желаемый output не помещаются.
 */
export function checkContextBudget(
  provider: ProviderConfig,
  estimatedInputChars: number,
  desiredOutputTokens: number = 8000,
): { ok: boolean; warning?: string; estimatedInputTokens: number } {
  const estimatedInputTokens = Math.ceil(estimatedInputChars / 3.5);
  const total = estimatedInputTokens + desiredOutputTokens + 500;

  if (total > provider.contextWindow) {
    return {
      ok: false,
      estimatedInputTokens,
      warning:
        `Input (${estimatedInputTokens} tok) + output (${desiredOutputTokens} tok) ` +
        `превышает контекст модели (${provider.contextWindow} tok). ` +
        `Рекомендация: включи YaRN в LM Studio (Advanced Configuration → RoPE scaling → yarn) ` +
        `или выбери модель с большим контекстом.`,
    };
  }

  // Предупреждение если занимаем >80% контекста — работает, но YaRN улучшит качество
  if (total > provider.contextWindow * 0.8) {
    return {
      ok: true,
      estimatedInputTokens,
      warning:
        `Контекст занят на ${Math.round((total / provider.contextWindow) * 100)}%. ` +
        `Для стабильности рассмотри YaRN scaling в LM Studio.`,
    };
  }

  return { ok: true, estimatedInputTokens };
}
