import type { StylePreset } from "./types";

/**
 * Editorial — журнальная типографика, засечки, крупные цифры, хайрлайн-правила.
 * Референс ожидается от пользователя (editorial.html). Пока stub — UI должен
 * показывать карточку "coming soon", логика не инжектит addon.
 */
export const EDITORIAL_PRESET: StylePreset = {
  id: "editorial",
  name: "Editorial",
  tagline: "Журнальная типографика",
  description:
    "Засечки, крупные дроп-капсы, тонкие правила, чёрно-белая гамма с одним акцентом. Для журналов, блогов, портфолио, премиум-брендов.",
  available: false,
  tokens: {
    palette: [],
  },
  principles: [],
  signatureMoves: [],
  systemPromptAddon: "",
};
