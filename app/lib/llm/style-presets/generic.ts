import type { StylePreset } from "./types";

/**
 * Generic — no-op preset. Сохраняет текущее дефолтное поведение пайплайна.
 * systemPromptAddon пустой — Coder идёт как раньше, только с design-tokens.
 */
export const GENERIC_PRESET: StylePreset = {
  id: "generic",
  name: "Generic",
  tagline: "Современный минимализм",
  description:
    "Дефолтный стиль: чистые Tailwind-лендинги, без жёстких визуальных требований. Coder-агент генерирует в привычной manner.",
  available: true,
  tokens: {
    palette: [],
  },
  principles: [],
  signatureMoves: [],
  systemPromptAddon: "",
};
