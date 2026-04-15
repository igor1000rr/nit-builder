import type { StylePreset, StylePresetId } from "./types";
import { GENERIC_PRESET } from "./generic";
import { NEON_CYBER_PRESET } from "./neon-cyber";
import { EDITORIAL_PRESET } from "./editorial";
import { TECH_TERMINAL_PRESET } from "./tech-terminal";

export { type StylePreset, type StylePresetId } from "./types";

export const STYLE_PRESETS: StylePreset[] = [
  GENERIC_PRESET,
  NEON_CYBER_PRESET,
  EDITORIAL_PRESET,
  TECH_TERMINAL_PRESET,
];

const BY_ID = new Map<StylePresetId, StylePreset>(
  STYLE_PRESETS.map((p) => [p.id, p]),
);

export function getStylePreset(id: StylePresetId): StylePreset {
  return BY_ID.get(id) ?? GENERIC_PRESET;
}

export function isKnownPresetId(id: string): id is StylePresetId {
  return BY_ID.has(id as StylePresetId);
}

export function getAvailablePresets(): StylePreset[] {
  return STYLE_PRESETS.filter((p) => p.available);
}

/**
 * Инжектит addon в существующий system prompt. Если preset no-op (generic/stub) —
 * возвращает prompt без изменений.
 *
 * Использование в Coder pipeline:
 *   const coderSystem = injectStylePreset(CODER_SYSTEM_PROMPT, 'neon-cyber');
 */
export function injectStylePreset(basePrompt: string, id: StylePresetId): string {
  const preset = getStylePreset(id);
  if (!preset.systemPromptAddon) return basePrompt;
  return `${basePrompt}\n${preset.systemPromptAddon}`;
}
