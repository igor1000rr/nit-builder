import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * NITGEN runs LOCAL LLMs only.
 *
 * Раньше здесь были fallback'и на Groq и OpenRouter. Они удалены — продукт
 * позиционируется как peer-to-peer, "ваш GPU, ваш inference, без облака".
 * Кодовая поддержка облачных провайдеров противоречит этому позиционированию
 * и создаёт риск что юзерский промпт случайно уйдёт во внешнее API.
 *
 * Единственный вариант — LM Studio (или совместимый OpenAI-API сервер) на
 * локальной машине пользователя. Запросы идут через WebSocket tunnel
 * (см. tunnelRegistry.server.ts) — браузер юзера → наш сервер → его
 * desktop-клиент → его LM Studio.
 */

export type ProviderId = "lmstudio";

export type ProviderConfig = {
  id: ProviderId;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindow: number;
};

export function getAvailableProviders(): ProviderConfig[] {
  const lmStudioUrl = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234";

  return [
    {
      id: "lmstudio",
      baseUrl: `${lmStudioUrl.replace(/\/$/, "")}/v1`,
      apiKey: "lm-studio",
      defaultModel: process.env.LMSTUDIO_MODEL ?? "qwen2.5-coder-7b-instruct",
      contextWindow: 32_000,
    },
  ];
}

export function getPreferredProvider(
  override?: { modelName?: string },
): ProviderConfig | null {
  const all = getAvailableProviders();
  if (!all.length) return null;
  const base = all[0]!;
  return override?.modelName ? { ...base, defaultModel: override.modelName } : base;
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
