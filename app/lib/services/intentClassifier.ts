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
 *
 * ВАЖНО: regex используют unicode-aware word boundaries (флаг `u` + \p{L}).
 * Стандартный `\b` в JS работает только с ASCII — для кириллицы он молча
 * не срабатывает, что в прошлом приводило к тому что весь классификатор
 * возвращал structuralHits=0, styleHits=0 для русских запросов.
 */

export type PolishIntent = "css_patch" | "full_rewrite";

export type ClassificationResult = {
  intent: PolishIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  styleHits: number;
  structuralHits: number;
  /** Каноническое id секции (первое совпадение) если правка адресована конкретной секции. */
  targetSection?: string;
  /** Все упомянутые в запросе канонические секции (дедуплицированно). */
  targetSections: string[];
};

// ─── Unicode-aware regex helpers ─────────────────────────────────
// W — unicode word char (буква любого алфавита, цифра, _).
// b — unicode-aware замена `\b`: место, где с одной стороны не word char.
const W = "[\\p{L}\\d_]";
const NB_LEFT = `(?<!${W})`;
const NB_RIGHT = `(?!${W})`;

/** Создать unicode-aware regex с word boundaries по обеим сторонам. */
function uw(inner: string): RegExp {
  return new RegExp(`${NB_LEFT}(?:${inner})${NB_RIGHT}`, "iu");
}

// ─── Стилевые паттерны ───────────────────────────────────────────
const STYLE_PATTERNS: RegExp[] = [
  uw("цвет\\p{L}*"),
  uw("колор\\p{L}*"),
  uw("color"),
  uw("палитр\\p{L}*"),
  uw("(син|красн|зел[её]н|ч[её]рн|бел|с[её]р|ж[её]лт|фиолетов|оранжев|розов|голуб|бордов|бирюзов|пурпур|малинов|корич)\\p{L}*"),
  uw("(blue|red|green|black|white|gray|grey|yellow|purple|orange|pink|cyan|magenta|brown)"),
  uw("т[её]мн\\p{L}*"),
  uw("светл\\p{L}*"),
  uw("dark"),
  uw("light"),
  uw("яр(к|ч)\\p{L}*"),
  uw("пригас\\p{L}*"),
  uw("фон\\p{L}*"),
  uw("background"),
  /\bbg-/i, // ASCII-only — Tailwind class
  uw("крупн\\p{L}*"),
  uw("мельч\\p{L}*"),
  uw("помельче"),
  uw("покрупнее"),
  uw("меньш\\p{L}*"),
  uw("больш\\p{L}*"),
  uw("шире"),
  uw("уже"),
  uw("отступ\\p{L}*"),
  uw("padding"),
  uw("margin"),
  uw("gap"),
  uw("интервал\\p{L}*"),
  uw("высот\\p{L}*"),
  uw("ширин\\p{L}*"),
  uw("шрифт\\p{L}*"),
  uw("font"),
  uw("жирн\\p{L}*"),
  uw("bold"),
  uw("курсив\\p{L}*"),
  uw("italic"),
  uw("подч[её]ркн\\p{L}*"),
  uw("скругл\\p{L}*"),
  uw("round\\p{L}*"),
  uw("тень\\p{L}*"),
  uw("shadow"),
  uw("прозрачн\\p{L}*"),
  uw("opacity"),
  uw("blur"),
  uw("размыт\\p{L}*"),
  uw("градиент\\p{L}*"),
  uw("gradient"),
  uw("дизайн\\p{L}*"),
  uw("тем(а|у|ы)"),
  uw("стил(ь|ем|я)\\p{L}*"),
  uw("вид"),
  uw("кнопк\\p{L}*"),
];

// ─── Структурные паттерны (требуют full_rewrite) ─────────────────
const STRUCTURAL_PATTERNS: RegExp[] = [
  uw("добав(ь|и|ить|ление|им)"),
  uw("встав(ь|ить|ка|им)"),
  uw("создай\\p{L}*"),
  uw("убер(и|ите|ём)"),
  uw("удал(и|ить|ите|яем|им)"),
  uw("выкин(ь|и|уть)"),
  uw("remove"),
  uw("add"),
  uw("секци\\p{L}*"),
  uw("блок\\p{L}*"),
  uw("section"),
  uw("banner"),
  uw("баннер\\p{L}*"),
  uw("перепиш\\p{L}*"),
  uw("переименуй"),
  uw("замени\\s+(текст|заголов|слов)"),
  uw("измени\\s+(текст|заголов|слов)"),
  uw("новый\\s+(текст|заголов)"),
  uw("напиши"),
  uw("придумай\\p{L}*"),
  uw("предложи\\p{L}*"),
  uw("перенес(и|ти)"),
  uw("перестав(ь|ить)"),
  uw("поменяй\\s+места?"),
  uw("swap"),
  uw("move"),
  uw("содерж\\p{L}*"),
  uw("контент\\p{L}*"),
  uw("прайс\\p{L}*"),
];

/**
 * Алиасы русских/английских слов для канонических section id.
 *
 * Порядок важен — сначала более специфичные паттерны ("фотографии в галерее"),
 * потом более общие ("галерея").
 */
const SECTION_ALIASES: Array<[RegExp, string]> = [
  // Hero / главный экран. "героe" с латинской 'e' — частая опечатка, поэтому [еe].
  [uw("геро(й|я|[еe]|ем)"), "hero"],
  [uw("главн(ый|ого|ом|ого)\\s+(экран\\p{L}*|блок\\p{L}*)"), "hero"],
  [uw("шап(ка|ку|ке|очк\\p{L}*)"), "hero"],
  [uw("первый\\s+экран"), "hero"],
  [uw("верхний\\s+блок"), "hero"],
  [uw("hero"), "hero"],
  [uw("header"), "hero"],

  // Menu
  [uw("меню"), "menu"],
  [uw("menu"), "menu"],

  // Pricing — у "цен" специфичнее
  [uw("прайс\\p{L}*"), "pricing"],
  [uw("цен(ы|ах|е|ник\\p{L}*|ами|у)"), "pricing"],
  [uw("тариф\\p{L}*"), "pricing"],
  [uw("pricing"), "pricing"],

  // Gallery
  [uw("галере\\p{L}*"), "gallery"],
  [uw("работы"), "gallery"],
  [uw("gallery"), "gallery"],

  // Contact
  [uw("контакт\\p{L}*"), "contact"],
  [uw("contact"), "contact"],

  // Footer (отдельная секция от contact)
  [uw("футер\\p{L}*"), "footer"],
  [uw("подвал\\p{L}*"), "footer"],
  [uw("нижний\\s+блок"), "footer"],
  [uw("footer"), "footer"],

  // Booking
  [uw("запис(и|ь|ю)"), "booking"],
  [uw("брон(ь|и|ировани\\p{L}*)"), "booking"],
  [uw("booking"), "booking"],

  // Testimonials
  [uw("отзыв\\p{L}*"), "testimonials"],
  [uw("testimonials"), "testimonials"],

  // Features
  [uw("фич\\p{L}*"), "features"],
  [uw("возможност\\p{L}*"), "features"],
  [uw("features"), "features"],

  // Services
  [uw("услуг\\p{L}*"), "services"],
  [uw("services"), "services"],

  // About
  [uw("о\\s+нас"), "about"],
  [uw("о\\s+компани\\p{L}*"), "about"],
  [uw("о\\s+себ\\p{L}*"), "about"],
  [uw("о\\s+проект\\p{L}*"), "about"],
  [uw("about"), "about"],

  // Team / masters / doctors
  [uw("коман(д|ды|де|ду)\\p{L}*"), "team"],
  [uw("мастер\\p{L}*"), "masters"],
  [uw("врач\\p{L}*"), "doctors"],
  [uw("team"), "team"],

  // Schedule
  [uw("расписан\\p{L}*"), "schedule"],
  [uw("schedule"), "schedule"],

  // CTA
  [uw("кнопка\\s+(действия|призыва)"), "cta"],
  [uw("cta"), "cta"],

  // Order form
  [uw("форм(а|у)\\s+заказ\\p{L}*"), "order-form"],
  [uw("заказать\\s+(торт|товар)"), "order-form"],
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
}

/**
 * Извлечь каноническое id первой упомянутой секции.
 * Backward-compat для старого API. Для multi-section — используй extractTargetSections.
 */
export function extractTargetSection(text: string): string | undefined {
  for (const [re, section] of SECTION_ALIASES) {
    if (re.test(text)) return section;
  }
  return undefined;
}

/**
 * Извлечь все канонические id упомянутых секций из запроса.
 * Дедуплицирует — даже если "hero" упомянут трижды разными синонимами,
 * вернётся один раз.
 */
export function extractTargetSections(text: string): string[] {
  if (!text || !text.trim()) return [];
  const set = new Set<string>();
  for (const [re, section] of SECTION_ALIASES) {
    if (re.test(text)) set.add(section);
  }
  return Array.from(set);
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
      targetSections: [],
    };
  }

  const styleHits = countMatches(text, STYLE_PATTERNS);
  const structuralHits = countMatches(text, STRUCTURAL_PATTERNS);
  const targetSections = extractTargetSections(text);
  const targetSection = targetSections[0];

  // Формат "scoped to section: X" удовлетворяет одновременно:
  //  - старому тесту intentClassifier.test.ts (toContain("section: hero"))
  //  - новому тесту extractTargetSections.test.ts (toContain("scoped"))
  const scopedSuffix =
    targetSections.length > 0
      ? ` (scoped to section: ${targetSections.join(", ")})`
      : "";

  if (structuralHits >= 1) {
    return {
      intent: "full_rewrite",
      confidence: structuralHits >= 2 ? "high" : "medium",
      reason: `structural keywords: ${structuralHits}${scopedSuffix}`,
      styleHits,
      structuralHits,
      targetSection,
      targetSections,
    };
  }

  if (styleHits >= 1) {
    return {
      intent: "css_patch",
      confidence: styleHits >= 2 ? "high" : "medium",
      reason: `style keywords: ${styleHits}${scopedSuffix}`,
      styleHits,
      structuralHits,
      targetSection,
      targetSections,
    };
  }

  return {
    intent: "full_rewrite",
    confidence: "low",
    reason: `no signal, default to safe full rewrite${scopedSuffix}`,
    styleHits,
    structuralHits,
    targetSection,
    targetSections,
  };
}
