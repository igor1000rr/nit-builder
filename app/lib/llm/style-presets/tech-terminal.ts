import type { StylePreset } from "./types";

/**
 * Tech-terminal — CRT-phosphor/dev-tool эстетика с моно-шрифтами и ASCII-артом.
 * Референс ожидается от пользователя (tech-terminal.html). Пока stub.
 */
export const TECH_TERMINAL_PRESET: StylePreset = {
  id: "tech-terminal",
  name: "Tech Terminal",
  tagline: "CRT-phosphor, dev-tool",
  description:
    "Моноширинные шрифты, phosphor-зелёный текст, ASCII-рамки, curor-blink, hex-палитры. Для DevTools, CLI-продуктов, cybersec.",
  available: false,
  tokens: {
    palette: [],
  },
  principles: [],
  signatureMoves: [],
  systemPromptAddon: "",
};
