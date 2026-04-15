import { describe, it, expect } from "vitest";
import {
  STYLE_PRESETS,
  getStylePreset,
  isKnownPresetId,
  getAvailablePresets,
  injectStylePreset,
} from "~/lib/llm/style-presets";

describe("style-presets registry", () => {
  it("содержит четыре preset'а (generic, neon-cyber, editorial, tech-terminal)", () => {
    expect(STYLE_PRESETS.length).toBe(4);
    const ids = STYLE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["generic", "neon-cyber", "editorial", "tech-terminal"]);
  });

  it("каждый preset имеет валидный name и description", () => {
    for (const p of STYLE_PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
    }
  });
});

describe("getStylePreset", () => {
  it("возвращает preset по id", () => {
    expect(getStylePreset("neon-cyber").name).toBe("Neon Cyber");
    expect(getStylePreset("editorial").name).toBe("Editorial");
  });

  it("fallback к generic для неизвестного id", () => {
    // @ts-expect-error — проверка runtime fallback
    expect(getStylePreset("unknown").id).toBe("generic");
  });
});

describe("isKnownPresetId", () => {
  it("true для всех id из registry", () => {
    expect(isKnownPresetId("generic")).toBe(true);
    expect(isKnownPresetId("neon-cyber")).toBe(true);
    expect(isKnownPresetId("editorial")).toBe(true);
    expect(isKnownPresetId("tech-terminal")).toBe(true);
  });
  it("false для чужих id", () => {
    expect(isKnownPresetId("random")).toBe(false);
    expect(isKnownPresetId("")).toBe(false);
  });
});

describe("getAvailablePresets", () => {
  it("возвращает только доступные (generic + neon-cyber)", () => {
    const available = getAvailablePresets();
    const ids = available.map((p) => p.id);
    expect(ids).toContain("generic");
    expect(ids).toContain("neon-cyber");
    expect(ids).not.toContain("editorial");
    expect(ids).not.toContain("tech-terminal");
  });
});

describe("injectStylePreset", () => {
  const BASE = "Base system prompt.";

  it("generic не меняет base", () => {
    expect(injectStylePreset(BASE, "generic")).toBe(BASE);
  });

  it("neon-cyber инжектит addon", () => {
    const result = injectStylePreset(BASE, "neon-cyber");
    expect(result).toContain(BASE);
    expect(result).toContain("NEON CYBER");
    expect(result).toContain("#05060a");
    expect(result).toContain("Unbounded");
    expect(result.length).toBeGreaterThan(BASE.length);
  });

  it("stub presets (editorial/tech-terminal) не инжектят (addon пустой)", () => {
    expect(injectStylePreset(BASE, "editorial")).toBe(BASE);
    expect(injectStylePreset(BASE, "tech-terminal")).toBe(BASE);
  });
});

describe("neon-cyber preset — детали", () => {
  const preset = getStylePreset("neon-cyber");

  it("имеет палитру из 5 цветов TonForge-reference", () => {
    expect(preset.tokens.palette).toContain("#05060a");
    expect(preset.tokens.palette).toContain("#33c7ff");
    expect(preset.tokens.palette).toContain("#ff2e93");
    expect(preset.tokens.palette).toContain("#d4ff00");
  });

  it("использует Unbounded + JetBrains Mono", () => {
    expect(preset.tokens.fontDisplay).toBe("Unbounded");
    expect(preset.tokens.fontBody).toBe("JetBrains Mono");
  });

  it("principles содержат glitch, hairline, scanlines", () => {
    const joined = preset.principles.join(" ").toLowerCase();
    expect(joined).toContain("glitch");
    expect(joined).toContain("хэйрлайн");
    expect(joined).toContain("scanline");
  });

  it("signatureMoves содержат CSS snippets", () => {
    expect(preset.signatureMoves.length).toBeGreaterThan(3);
    const joined = preset.signatureMoves.join("\n");
    expect(joined).toContain("@keyframes");
    expect(joined).toContain("conic-gradient");
  });
});
