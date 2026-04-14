/**
 * Курированные дизайн-токены для Coder-стадии.
 *
 * Проблема: локальные кодовые модели без подсказок выдают бледные решения:
 * вечный Inter + синий #3b82f6 + серые оттенки. Результат — буквально любая
 * генерация выглядит как "AI-сгенериранный saas" независимо от темы.
 *
 * Решение: даём модели конкретные hex-значения и имена Google Fonts под каждый
 * color_mood. Палитры подобраны вручную, не случайно. Шрифты — с учётом языка
 * (для ru/by выбираем только из тех что имеют cyrillic subset).
 *
 * Токены передаются как ПОДСКАЗКА в user-message Coder-а (~200-300 токенов),
 * а не как обязательство — модель может отклониться если это обосновано style_hints.
 */

export type ColorMood =
  | "warm-pastel"
  | "cool-mono"
  | "vibrant-neon"
  | "dark-premium"
  | "earth-natural"
  | "light-minimal"
  | "bold-contrast";

export type Language = "ru" | "en" | "by";

export type ColorPalette = {
  mood: ColorMood;
  description: string;
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  muted: string;
};

export const PALETTES: Record<ColorMood, ColorPalette> = {
  "warm-pastel": {
    mood: "warm-pastel",
    description: "кремово-охристая, терракотовые акценты, мускатный орех",
    background: "#fdf6ec",
    foreground: "#2d1b14",
    primary: "#d97757",
    primaryForeground: "#fffaf4",
    accent: "#e9b872",
    muted: "#ead7c0",
  },
  "cool-mono": {
    mood: "cool-mono",
    description: "холодная серо-сиреневая, стальные оттенки, электрический индиго как единственный акцент",
    background: "#f7f8fa",
    foreground: "#0f172a",
    primary: "#4f46e5",
    primaryForeground: "#ffffff",
    accent: "#64748b",
    muted: "#e2e8f0",
  },
  "vibrant-neon": {
    mood: "vibrant-neon",
    description: "чёрный фон, кислотный лайм и маджента, gradient-эффекты, glow",
    background: "#0a0a0f",
    foreground: "#f5f5fa",
    primary: "#d946ef",
    primaryForeground: "#0a0a0f",
    accent: "#84cc16",
    muted: "#1a1a24",
  },
  "dark-premium": {
    mood: "dark-premium",
    description: "глубокий угольный фон, матовое золото, кремовые тексты, без яркости",
    background: "#18181b",
    foreground: "#fafaf9",
    primary: "#c9a66b",
    primaryForeground: "#18181b",
    accent: "#a8a29e",
    muted: "#27272a",
  },
  "earth-natural": {
    mood: "earth-natural",
    description: "оливковый и хаки, кофе, терракота, невыбеленный лён",
    background: "#f5f3ee",
    foreground: "#292524",
    primary: "#5a7a52",
    primaryForeground: "#f5f3ee",
    accent: "#a16207",
    muted: "#d6d3d1",
  },
  "light-minimal": {
    mood: "light-minimal",
    description: "чистый белый, один тёмный акцент, много воздуха, тонкие серые границы",
    background: "#ffffff",
    foreground: "#0a0a0a",
    primary: "#0a0a0a",
    primaryForeground: "#ffffff",
    accent: "#404040",
    muted: "#f4f4f5",
  },
  "bold-contrast": {
    mood: "bold-contrast",
    description: "жёлтый и чёрный, высокий контраст, плоские геометричные блоки, swiss/brutalist выборка",
    background: "#fafafa",
    foreground: "#0a0a0a",
    primary: "#facc15",
    primaryForeground: "#0a0a0a",
    accent: "#dc2626",
    muted: "#e5e5e5",
  },
};

export type FontPair = {
  display: string;
  body: string;
  displayWeight: string;
  bodyWeight: string;
  cyrillic: boolean;
  cdnUrl: string;
};

/**
 * Курированные шрифтовые пары. cyrillic=true — оба шрифта имеют cyrillic subset.
 * URL-ы предсобраны с display=swap и нужными весами.
 */
const FONT_PAIRS: Record<ColorMood, FontPair> = {
  "warm-pastel": {
    display: "Fraunces",
    body: "Nunito",
    displayWeight: "600,700",
    bodyWeight: "400,600",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Nunito:wght@400;600&display=swap",
  },
  "cool-mono": {
    display: "Space Grotesk",
    body: "Inter",
    displayWeight: "500,700",
    bodyWeight: "400,500",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap",
  },
  "vibrant-neon": {
    display: "Unbounded",
    body: "JetBrains Mono",
    displayWeight: "600,800",
    bodyWeight: "400,600",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=JetBrains+Mono:wght@400;600&display=swap",
  },
  "dark-premium": {
    display: "Playfair Display",
    body: "Manrope",
    displayWeight: "500,700",
    bodyWeight: "400,600",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Manrope:wght@400;600&display=swap",
  },
  "earth-natural": {
    display: "Fraunces",
    body: "Manrope",
    displayWeight: "500,700",
    bodyWeight: "400,500",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Manrope:wght@400;500&display=swap",
  },
  "light-minimal": {
    display: "Inter",
    body: "Inter",
    displayWeight: "600,800",
    bodyWeight: "400,500",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap",
  },
  "bold-contrast": {
    display: "Archivo",
    body: "Inter",
    displayWeight: "800,900",
    bodyWeight: "400,500",
    cyrillic: true,
    cdnUrl:
      "https://fonts.googleapis.com/css2?family=Archivo:wght@800;900&family=Inter:wght@400;500&display=swap",
  },
};

export function getPalette(mood: string): ColorPalette {
  return (PALETTES as Record<string, ColorPalette>)[mood] ?? PALETTES["light-minimal"];
}

export function pickFontPair(params: {
  colorMood: string;
  language?: Language;
}): FontPair {
  const base = (FONT_PAIRS as Record<string, FontPair>)[params.colorMood];
  if (base) return base;
  return FONT_PAIRS["light-minimal"];
}

/**
 * Строит текстовый блок с дизайн-токенами для user-message Coder-а.
 */
export function buildDesignTokenHint(params: {
  colorMood: string;
  language?: Language;
}): string {
  const p = getPalette(params.colorMood);
  const f = pickFontPair(params);

  return `РЕКОМЕНДОВАННЫЕ ДИЗАЙН-ТОКЕНЫ (приоритетны над значениями по умолчанию, но можно отклониться ради style_hints):

Палитра (${p.description}):
  background: ${p.background}
  foreground: ${p.foreground}
  primary (CTA, акценты): ${p.primary}
  primary-foreground (текст на праймари): ${p.primaryForeground}
  accent (вторичный): ${p.accent}
  muted (нейтральный фон карточек): ${p.muted}
  Используй эти hex-значения через inline style="..." или arbitrary Tailwind bg-[${p.primary}].
  Избегай вечных bg-blue-500 / text-gray-800 — они делают любой сайт одинаковым.

Шрифты (Google Fonts, с кириллицей):
  display (заголовки): ${f.display}, веса ${f.displayWeight}
  body (основной текст): ${f.body}, веса ${f.bodyWeight}
  Подключи в <head>: <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${f.cdnUrl}" rel="stylesheet">
  В CSS: h1,h2,h3 → font-family: "${f.display}", serif/sans-serif; body → font-family: "${f.body}", sans-serif.`;
}
