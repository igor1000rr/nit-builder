/**
 * Public types для htmlOrchestrator pipeline.
 *
 * Вынесены отдельно чтобы:
 *   - не таскать всю heavy логику ради импорта типа в UI/SSE-парсере
 *   - типы оставались стабильным контрактом независимо от рефакторинга реализации
 */

import type { Plan } from "~/lib/utils/planSchema";
import type { PolishIntent } from "~/lib/services/intentClassifier";
import type { StylePresetId } from "~/lib/llm/style-presets";

export type PipelineEvent =
  | { type: "session_init"; sessionId: string }
  | { type: "step_start"; roleName: string; model: string; provider: string }
  | { type: "plan_ready"; plan: Plan; cached?: boolean }
  | { type: "template_selected"; templateId: string; templateName: string }
  | { type: "template_pruned"; removed: string[]; kept: string[] }
  | { type: "text"; text: string }
  | { type: "step_complete"; html?: string }
  | {
      type: "polish_mode";
      intent: PolishIntent;
      reason: string;
      targetSection?: string;
    }
  | { type: "css_patch_applied"; ruleCount: number; css: string; scoped: boolean }
  | {
      type: "section_polish_used";
      sectionId: string;
      sectionChars: number;
      fullHtmlChars: number;
    }
  | {
      type: "truncated";
      canContinue: boolean;
      attemptsLeft: number;
      partialChars: number;
    }
  | {
      type: "tokens";
      mode: "create" | "polish" | "continue";
      prompt: number;
      completion: number;
    }
  | { type: "rag_fewshot"; count: number; topScore: number; approxTokens: number }
  | { type: "plan_reasoning"; chars: number }
  | {
      type: "skeleton_inject_used";
      templateId: string;
      slotsFilled: number;
      slotsTotal: number;
      fillRatio: number;
      /** Tier 4: сколько расширенных слотов (pricing/faq/hours/contact) заполнено (0..4). */
      extendedSlotsFilled: number;
    }
  | { type: "style_preset_used"; presetId: StylePresetId; promptDelta: number }
  | { type: "error"; message: string };

export type OrchestratorOptions = {
  providerOverride?: { modelName?: string };
  skipPlanCache?: boolean;
  polishIntent?: PolishIntent;
  targetSection?: string;
  /**
   * Style preset для Coder-этапа. Default "generic" — поведение как раньше.
   * Для "neon-cyber" в system prompt инжектится ~900 chars с palette / fonts /
   * signature moves; Coder берёт их как жёсткие правила.
   * Skeleton-injection path (без Coder) preset игнорирует — там нет LLM-шага.
   */
  stylePresetId?: StylePresetId;
};
