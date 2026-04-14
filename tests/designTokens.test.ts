import { describe, it, expect } from "vitest";
import {
  PALETTES,
  getPalette,
  pickFontPair,
  buildDesignTokenHint,
  type ColorMood,
} from "~/lib/config/designTokens";

const ALL_MOODS: ColorMood[] = [
  "warm-pastel",
  "cool-mono",
  "vibrant-neon",
  "dark-premium",
  "earth-natural",
  "light-minimal",
  "bold-contrast",
];

describe("PALETTES", () => {
  it("включает все 7 color_mood из PlanSchema", () => {
    for (const mood of ALL_MOODS) {
      expect(PALETTES[mood]).toBeDefined();
    }
  });

  it("каждая палитра содержит все требуемые цвета", () => {
    for (const mood of ALL_MOODS) {
      const p = PALETTES[mood];
      expect(p.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.primaryForeground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.muted).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  it("каждый mood уникален (нет двух одинаковых palette.primary)", () => {
    const primaries = ALL_MOODS.map((m) => PALETTES[m].primary);
    expect(new Set(primaries).size).toBe(primaries.length);
  });
});

describe("getPalette", () => {
  it("возвращает корректную палитру", () => {
    expect(getPalette("warm-pastel").primary).toBe("#d97757");
  });

  it("для неизвестного mood — fallback на light-minimal", () => {
    const p = getPalette("nonexistent-mood");
    expect(p.mood).toBe("light-minimal");
  });
});

describe("pickFontPair", () => {
  it("возвращает шрифтовую пару для каждого mood", () => {
    for (const mood of ALL_MOODS) {
      const f = pickFontPair({ colorMood: mood });
      expect(f.display).toBeTruthy();
      expect(f.body).toBeTruthy();
      expect(f.cdnUrl).toMatch(/^https:\/\/fonts\.googleapis\.com/);
    }
  });

  it("все пары поддерживают кириллицу (критично для ru/by)", () => {
    for (const mood of ALL_MOODS) {
      const f = pickFontPair({ colorMood: mood, language: "ru" });
      expect(f.cyrillic).toBe(true);
    }
  });

  it("display=swap в cdnUrl (защита от FOIT)", () => {
    for (const mood of ALL_MOODS) {
      expect(pickFontPair({ colorMood: mood }).cdnUrl).toContain("display=swap");
    }
  });
});

describe("buildDesignTokenHint", () => {
  it("включает hex-значения из палитры", () => {
    const hint = buildDesignTokenHint({ colorMood: "warm-pastel" });
    expect(hint).toContain("#d97757");
    expect(hint).toContain("#fdf6ec");
  });

  it("включает имена шрифтов и CDN-ссылку", () => {
    const hint = buildDesignTokenHint({ colorMood: "dark-premium", language: "ru" });
    expect(hint).toContain("Playfair Display");
    expect(hint).toContain("Manrope");
    expect(hint).toContain("fonts.googleapis.com");
  });

  it("даёт preconnect-инструкцию для <head>", () => {
    const hint = buildDesignTokenHint({ colorMood: "cool-mono" });
    expect(hint).toContain("preconnect");
  });

  it("предупреждает о вечных bg-blue-500", () => {
    const hint = buildDesignTokenHint({ colorMood: "warm-pastel" });
    expect(hint.toLowerCase()).toContain("bg-blue-500");
  });
});
