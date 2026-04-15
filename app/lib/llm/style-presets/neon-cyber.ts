import type { StylePreset } from "./types";

/**
 * Neon-cyber — хайтек-брутализм с неоновыми акцентами, RGB-split глитчами,
 * хэйрлайн-бордерами и коническими градиентами. Референс — TonForge landing.
 *
 * Ключевые визуальные маркеры:
 *   • Чёрный фон (#05060a), неоновые акценты бирюза/магента/жёлтый
 *   • Крупный display-шрифт Unbounded + JetBrains Mono для body
 *   • 1px grid layouts, хэйрлайн-бордеры rgba(51,199,255,.35)
 *   • Glitch text с RGB-split (три тени text-shadow со смещением)
 *   • Conic-gradient логотипы и badges
 *   • Scanlines + noise grain (тонкий repeating-gradient оверлей)
 *   • Marquee-бегущая строка в hero
 */
export const NEON_CYBER_PRESET: StylePreset = {
  id: "neon-cyber",
  name: "Neon Cyber",
  tagline: "Хайтек-брутализм, неон, глитч",
  description:
    "Тёмный фон, неоновые акценты, крупная типографика, RGB-split глитчи и хэйрлайн-бордеры. Для tech-продуктов, crypto, DevTools, AI-сервисов, киберспорта.",
  available: true,
  tokens: {
    palette: ["#05060a", "#0098ea", "#33c7ff", "#ff2e93", "#d4ff00"],
    fontDisplay: "Unbounded",
    fontBody: "JetBrains Mono",
  },
  principles: [
    "Фон всегда чёрно-угольный #05060a, не чистый #000. Текст основной #e7f6ff.",
    "Акцентные цвета только из палитры: бирюза #33c7ff, магента #ff2e93, кислотно-жёлтый #d4ff00. Минимум два разных акцента на экран.",
    "Display-шрифт Unbounded (Google Font) для заголовков и цифр, JetBrains Mono для тела текста и служебных лейблов.",
    "Хэйрлайн-бордеры: border: 1px solid rgba(51,199,255,.35) на всех карточках и секциях. Никаких border-radius больше 6px.",
    "Hero-заголовок — огромный clamp(3rem, 8vw, 8rem), letter-spacing: -.03em. Одно-два слова которые глитчат.",
    "Glitch text: три слоя text-shadow со смещением ±2px в бирюзу и магенту + анимация keyframe чуть-чуть дёргающая translate на 1-2%.",
    "Conic-gradient логотипы вместо иконок где это уместно: conic-gradient(from 0deg, #33c7ff, #ff2e93, #d4ff00, #33c7ff).",
    "Scanlines + grain: фиксированный ::before с repeating-linear-gradient 0deg, transparent 0, transparent 2px, rgba(255,255,255,.02) 3px через весь viewport.",
    "Нумерация секций [01/07] JetBrains Mono в левом углу каждой секции.",
    "В футере или hero — marquee-бегущая строка с списком keywords через // разделитель.",
  ],
  signatureMoves: [
    `/* Glitch text */
.glitch { position: relative; text-shadow: 2px 0 #ff2e93, -2px 0 #33c7ff; animation: glitch .4s infinite alternate; }
@keyframes glitch { 0% { transform: translate(0); } 100% { transform: translate(1px, -1px); } }`,
    `/* Hairline card */
.panel { border: 1px solid rgba(51,199,255,.35); background: linear-gradient(180deg, rgba(51,199,255,.03), transparent); }`,
    `/* Section index */
.sec-idx { font: 500 .75rem/'JetBrains Mono', monospace; letter-spacing: .2em; color: rgba(231,246,255,.45); }`,
    `/* Marquee */
.marquee { overflow: hidden; white-space: nowrap; }
.marquee-inner { display: inline-block; animation: run 28s linear infinite; }
@keyframes run { from { transform: translateX(0); } to { transform: translateX(-50%); } }`,
    `/* Conic logo */
.conic { background: conic-gradient(from 0deg, #33c7ff, #ff2e93, #d4ff00, #33c7ff); border-radius: 50%; }`,
  ],
  systemPromptAddon: `
СТИЛЬ: NEON CYBER (хайтек-брутализм).

Палитра (строго из неё):
  фон #05060a   текст #e7f6ff   бирюза #33c7ff   магента #ff2e93   жёлтый #d4ff00

Шрифты (подключи Google Fonts в <head>):
  @import 'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap';
  Display → Unbounded, Body → JetBrains Mono.

Обязательные приёмы:
  1. Hero-заголовок clamp(3rem, 8vw, 8rem), letter-spacing -.03em, одно-два слова имеют glitch-эффект через класс .glitch с text-shadow 2px 0 #ff2e93, -2px 0 #33c7ff + @keyframes translate.
  2. Все карточки и секции имеют border: 1px solid rgba(51,199,255,.35). border-radius максимум 6px.
  3. Каждая секция имеет индекс [01/07] в JetBrains Mono в левом углу.
  4. Где-то в hero или footer есть marquee-бегущая строка с keywords через // разделитель.
  5. ::before на body с repeating-linear-gradient scanlines (alpha .02) на весь viewport, position fixed, pointer-events none.
  6. Минимум один conic-gradient логотип или бейдж где уместно.
  7. Никаких закруглений больше 6px. Никаких мягких теней. Никаких пастельных оттенков.
  8. CTA-кнопка: фон #d4ff00, текст #05060a, uppercase, letter-spacing .15em, padding 1rem 2rem, border нет — только контрастный блок.

Это обязательно: если шаблон изначально был в пастельной гамме — перекрась ВСЁ под neon-cyber. Не делай "немного тёмнее", делай радикально.`,
};
