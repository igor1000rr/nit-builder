/**
 * Классификатор намерений для Polisher + детектор целевой секции.
 */

export type PolishIntent = "css_patch" | "full_rewrite";

export type ClassificationResult = {
  intent: PolishIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  styleHits: number;
  structuralHits: number;
  /** id секции если юзер упомянул конкретную (герой, меню, цены, etc) */
  targetSection: string | null;
};

const STYLE_PATTERNS: RegExp[] = [
  /\bцвет\w*/i,
  /\bколор\w*/i,
  /\bcolor\b/i,
  /\bпалитр\w*/i,
  /\b(син|красн|зел[её]н|ч[её]рн|бел|с[её]р|ж[её]лт|фиолетов|оранжев|розов|голуб|бордов|бирюзов|пурпур|малинов|корич)\w*/i,
  /\b(blue|red|green|black|white|gray|grey|yellow|purple|orange|pink|cyan|magenta|brown)\b/i,
  /\bт[её]мн\w*/i,
  /\bсветл\w*/i,
  /\bdark\b/i,
  /\blight\b/i,
  /\bяр(к|ч)\w*/i,
  /\bпригас\w*/i,
  /\bфон\w*/i,
  /\bbackground\b/i,
  /\bbg-/i,
  /\bкрупн\w*/i,
  /\bмельч\w*/i,
  /\bпомельче/i,
  /\bпокрупнее/i,
  /\bменьш\w*/i,
  /\bбольш\w*/i,
  /\bшире\b/i,
  /\bуже\b/i,
  /\bотступ\w*/i,
  /\bpadding\b/i,
  /\bmargin\b/i,
  /\bgap\b/i,
  /\bинтервал\w*/i,
  /\bвысот\w*/i,
  /\bширин\w*/i,
  /\bшрифт\w*/i,
  /\bfont\b/i,
  /\bжирн\w*/i,
  /\bbold\b/i,
  /\bкурсив\w*/i,
  /\bitalic\b/i,
  /\bподч[её]ркн\w*/i,
  /\bскругл\w*/i,
  /\bround\w*/i,
  /\bтень\w*/i,
  /\bshadow\b/i,
  /\bпрозрачн\w*/i,
  /\bopacity\b/i,
  /\bblur\b/i,
  /\bразмыт\w*/i,
  /\bградиент\w*/i,
  /\bgradient\b/i,
  /\bдизайн\w*/i,
  /\bтем(а|у|ы)\b/i,
  /\bстил(ь|ем|я)\w*/i,
  /\bвид\b/i,
  /\bкнопк\w*/i,
];

const STRUCTURAL_PATTERNS: RegExp[] = [
  /\bдобав(ь|и|ить|ление|им)/i,
  /\bвстав(ь|ить|ка|им)/i,
  /\bсоздай\w*/i,
  /\bубер(и|ите|ём)/i,
  /\bудал(и|ить|ите|яем|им)/i,
  /\bвыкин(ь|и|уть)/i,
  /\bremove\b/i,
  /\badd\b/i,
  /\bсекци\w*/i,
  /\bблок\w*/i,
  /\bsection\b/i,
  /\bbanner\b/i,
  /\bбаннер\w*/i,
  /\bперепиш\w*/i,
  /\bпереименуй/i,
  /\bзамени\s+(текст|заголов|слов)/i,
  /\bизмени\s+(текст|заголов|слов)/i,
  /\bновый\s+(текст|заголов)/i,
  /\bнапиши\b/i,
  /\bпридумай\w*/i,
  /\bпредложи\w*/i,
  /\bперенес(и|ти)/i,
  /\bперестав(ь|ить)/i,
  /\bпоменяй\s+места?/i,
  /\bswap\b/i,
  /\bmove\b/i,
  /\bсодерж\w*/i,
  /\bконтент\w*/i,
  /\bпрайс\w*/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
}

/**
 * Находит упоминание конкретной секции в запросе юзера.
 * Используется для scope'а CSS-патчей: если вернул "hero", селекторы
 * обернутся в [data-nit-section="hero"]. null = вся страница.
 */
export function detectSectionTarget(text: string): string | null {
  const t = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(геро[яйе]|шапк[ауие]|первы[йе]\s*экран|верхн[юяейем]\s*част|hero)\b/i, "hero"],
    [/\b(меню|menu)\b/i, "menu"],
    [/\b(цен[аынуе]?|тариф\w*|прайс\w*|pricing)\b/i, "pricing"],
    [/\b(контакт\w*|contact)\b/i, "contact"],
    [/\b(отзыв\w*|testimonials)\b/i, "testimonials"],
    [/\b(фич\w*|возможност\w*|преимуществ\w*|features)\b/i, "features"],
    [/\b(галере[яйеию]|gallery)\b/i, "gallery"],
    [/\b(о\s+нас|о\s+компании|about)\b/i, "about"],
    [/\b(cta|призыв\s+к\s+действ\w*)\b/i, "cta"],
    [/\b(футер\w*|подвал\w*|footer)\b/i, "footer"],
    [/\b(запис[ьяие]\w*|брониров\w*|booking)\b/i, "booking"],
    [/\b(услуг[иуахем]?|services)\b/i, "services"],
    [/\b(команд[ауые]?|мастер\w*|team)\b/i, "team"],
    [/\b(расписан\w*|расписание|schedule)\b/i, "schedule"],
  ];
  for (const [re, id] of rules) {
    if (re.test(t)) return id;
  }
  return null;
}

export function classifyPolishIntent(userRequest: string): ClassificationResult {
  const text = userRequest.trim();

  if (!text) {
    return {
      intent: "full_rewrite",
      confidence: "low",
      reason: "empty request",
      styleHits: 0,
      structuralHits: 0,
      targetSection: null,
    };
  }

  const styleHits = countMatches(text, STYLE_PATTERNS);
  const structuralHits = countMatches(text, STRUCTURAL_PATTERNS);
  const targetSection = detectSectionTarget(text);

  if (structuralHits >= 1) {
    return {
      intent: "full_rewrite",
      confidence: structuralHits >= 2 ? "high" : "medium",
      reason: `structural keywords: ${structuralHits}`,
      styleHits,
      structuralHits,
      targetSection,
    };
  }

  if (styleHits >= 1) {
    return {
      intent: "css_patch",
      confidence: styleHits >= 2 ? "high" : "medium",
      reason: targetSection
        ? `style keywords: ${styleHits}, scoped to ${targetSection}`
        : `style keywords: ${styleHits}`,
      styleHits,
      structuralHits,
      targetSection,
    };
  }

  return {
    intent: "full_rewrite",
    confidence: "low",
    reason: "no signal, default to safe full rewrite",
    styleHits,
    structuralHits,
    targetSection,
  };
}
