/**
 * Классификатор намерений для Polisher + извлечение целевой секции.
 *
 * Задача 1: определить можно ли обработать запрос дешёвым CSS-патчем
 * или нужен полный rewrite.
 * Задача 2: если правка адресована конкретной секции ("сделай героя синим"),
 * извлечь её каноническое id (hero/menu/pricing/etc) и скопировать CSS-селекторы
 * в [data-nit-section="X"] (атрибуты проставлены enrichSectionAnchors).
 *
 * Эвристика работает 0ms и покрывает ~80% типовых запросов.
 */

export type PolishIntent = "css_patch" | "full_rewrite";

export type ClassificationResult = {
  intent: PolishIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  styleHits: number;
  structuralHits: number;
  /** Каноническое id секции если правка адресована конкретной секции. */
  targetSection?: string;
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

/**
 * Алиасы русских/английских слов для канонических section id.
 *
 * Порядок важен — сначала более специфичные паттерны ("фотографии в галерее"),
 * потом более общие ("галерея").
 *
 * Используются только канонические id из sections в Plan schema (hero, menu, services, etc).
 */
const SECTION_ALIASES: Array<[RegExp, string]> = [
  // Hero / главный экран
  [/\bгеро(й|я|е|ем)\b/i, "hero"],
  [/\bглавн(ый|ые)\s+(экран|блок|экране)/i, "hero"],
  [/\bшап(ка|ку|ке|очк)/i, "hero"],
  [/\bверхний\s+блок/i, "hero"],
  [/\bhero\b/i, "hero"],
  [/\bheader\b/i, "hero"],

  // Menu
  [/\bменю\b/i, "menu"],
  [/\bmenu\b/i, "menu"],

  // Pricing (раньше services — у "цен" специфичнее)
  [/\bпрайс\w*/i, "pricing"],
  [/\bцен(ы|ах|е|ник|ами|ником|у)\b/i, "pricing"],
  [/\bтариф\w*/i, "pricing"],
  [/\bpricing\b/i, "pricing"],

  // Gallery
  [/\bгалере\w*/i, "gallery"],
  [/\bработы\b/i, "gallery"],
  [/\bgallery\b/i, "gallery"],

  // Contact
  [/\bконтакт\w*/i, "contact"],
  [/\bcontact\b/i, "contact"],

  // Booking
  [/\bзапис(и|ь|ю)/i, "booking"],
  [/\bброн(ь|и|ировани)/i, "booking"],
  [/\bbooking\b/i, "booking"],

  // Testimonials
  [/\bотзыв\w*/i, "testimonials"],
  [/\btestimonials\b/i, "testimonials"],

  // Features
  [/\bфич\w*/i, "features"],
  [/\bвозможност\w*/i, "features"],
  [/\bfeatures\b/i, "features"],

  // Services
  [/\bуслуг\w*/i, "services"],
  [/\bservices\b/i, "services"],

  // About
  [/\bо\s+нас\b/i, "about"],
  [/\bо\s+компани/i, "about"],
  [/\bо\s+себ\w*/i, "about"],
  [/\bо\s+проект/i, "about"],
  [/\babout\b/i, "about"],

  // Team / masters / doctors
  [/\bкоманд\w*/i, "team"],
  [/\bмастер\w*/i, "masters"],
  [/\bврач\w*/i, "doctors"],
  [/\bteam\b/i, "team"],

  // Schedule
  [/\bрасписан\w*/i, "schedule"],
  [/\bschedule\b/i, "schedule"],

  // Footer
  [/\bфутер/i, "footer"],
  [/\bподвал/i, "footer"],
  [/\bнижний\s+блок/i, "footer"],
  [/\bfooter\b/i, "footer"],

  // CTA
  [/\bкнопка\s+(действия|призыва)/i, "cta"],
  [/\bcta\b/i, "cta"],

  // Order form
  [/\bформ(а|у)\s+заказ/i, "order-form"],
  [/\bзаказать\s+(торт|товар)/i, "order-form"],
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
}

/**
 * Извлечь каноническое id секции из запроса пользователя.
 * Возвращает первое совпадение в порядке специфичности.
 */
export function extractTargetSection(text: string): string | undefined {
  for (const [re, section] of SECTION_ALIASES) {
    if (re.test(text)) return section;
  }
  return undefined;
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
    };
  }

  const styleHits = countMatches(text, STYLE_PATTERNS);
  const structuralHits = countMatches(text, STRUCTURAL_PATTERNS);
  const targetSection = extractTargetSection(text);

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
      reason: `style keywords: ${styleHits}${targetSection ? ` + section: ${targetSection}` : ""}`,
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
