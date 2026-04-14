/**
 * Классификатор намерений для Polisher.
 *
 * Задача: определить, можно ли обработать запрос юзера дешёвым CSS-патчем
 * (~200 токенов) или нужен полный rewrite всего HTML (~6000-12000 токенов).
 *
 * Дополнительно извлекает целевые секции (hero/pricing/footer/etc) если
 * юзер явно ограничивает правку. Это позволяет CSS-патчеру генерить
 * скопированные селекторы [data-nit-section="X"] вместо глобальных.
 *
 * Запросы вида "сделай фон синим", "увеличь заголовки", "в тёмную тему" —
 * это css_patch (глобальный). "Сделай hero синим", "подсвети только
 * прайс" — css_patch со scope. "Добавь секцию отзывы", "убери блок цен",
 * "перепиши текст в герое" — full_rewrite.
 *
 * Эвристика работает 0ms и покрывает ~80% типовых запросов. Для неоднозначных
 * и нераспознанных выбираем full_rewrite — безопасный default.
 */

export type PolishIntent = "css_patch" | "full_rewrite";

export type ClassificationResult = {
  intent: PolishIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  styleHits: number;
  structuralHits: number;
  /** Section ids упомянутые в запросе (если есть). Пусто — глобальная правка. */
  targetSections: string[];
};

/**
 * Сигналы в пользу CSS-патча (визуальные свойства).
 */
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

/**
 * Сигналы в пользу полного rewrite (структура/контент). Приоритетнее style.
 */
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
  /\bменю\b/i,
  /\bпрайс\w*/i,
  /\bцен(ы|ам|ник)\w*/i,
];

/**
 * Словарь section id → синонимы для извлечения target sections.
 *
 * id должны совпадать с sections из htmlTemplatesCatalog. Ключи — section id,
 * значения — регексы которые срабатывают когда юзер его упоминает.
 */
const SECTION_SYNONYMS: Record<string, RegExp[]> = {
  hero: [/\bhero\b/i, /\bгеро[ейя]\w*/i, /\bпервый\s+экран/i, /\bшапк\w*/i],
  about: [/\babout\b/i, /\bо\s+(нас|себе|компании|студии)/i, /\bпро\s+(нас|компанию)/i],
  services: [/\bservices?\b/i, /\bуслуг\w*/i, /\bсервис\w*/i],
  gallery: [/\bgallery\b/i, /\bгалере\w*/i, /\bработ\w*/i, /\bпортфолио\b/i],
  menu: [/\bmenu\b/i, /\bменю\b/i],
  pricing: [/\bpricing\b/i, /\bцен(ы|ам|ник)\w*/i, /\bпрайс\w*/i, /\bтариф\w*/i, /\bстоим\w*/i],
  contact: [/\bcontacts?\b/i, /\bконтакт\w*/i, /\bфутер\b/i, /\bfooter\b/i, /\bподвал\b/i],
  booking: [/\bbooking\b/i, /\bбронь\b/i, /\bбронирован\w*/i, /\bзапис(ь|и)\b/i],
  features: [/\bfeatures?\b/i, /\bфичи?\b/i, /\bвозможност\w*/i, /\bпреимуществ\w*/i],
  testimonials: [/\btestimonials?\b/i, /\bотзыв\w*/i, /\bреценз\w*/i],
  cta: [/\bcta\b/i, /\bпризыв\w*/i],
  schedule: [/\bschedule\b/i, /\bрасписан\w*/i, /\bграфик\b/i, /\bпрограмм\w+\s+дн/i],
  story: [/\bstory\b/i, /\bистори\w*/i],
  rsvp: [/\brsvp\b/i, /\bподтвержден\w*/i],
  tracks: [/\btracks?\b/i, /\bтрек\w*/i],
  events: [/\bevents?\b/i, /\bивент\w*/i, /\bмероприят\w*/i],
  classes: [/\bclasses?\b/i, /\bзаняти\w*/i, /\bклассы\b/i],
  instructors: [/\binstructors?\b/i, /\bинструктор\w*/i],
  doctors: [/\bdoctors?\b/i, /\bврач\w*/i, /\bдокт(о|у)р\w*/i],
  masters: [/\bmasters?\b/i, /\bмастер\w*/i],
  programs: [/\bprograms?\b/i, /\bпрограмм\w*/i],
  "why-us": [/\bwhy[-\s]?us\b/i, /\bпочему\s+мы\b/i],
  "how-it-works": [/\bhow[-\s]?it[-\s]?works\b/i, /\bкак\s+(работает|это\s+работает|устроено)/i],
  "order-form": [/\border[-\s]?form\b/i, /\bформ\w+\s+заказ/i, /\bзаказ\w+\s+форм/i],
  hours: [/\bhours\b/i, /\bчасы\s+работ/i, /\bграфик\s+работ/i],
  location: [/\blocation\b/i, /\bадрес\b/i, /\bкарт\w*/i, /\bлокаци\w*/i],
  skills: [/\bskills?\b/i, /\bнавык\w*/i, /\bскилл\w*/i],
  projects: [/\bprojects?\b/i, /\bпроект\w*/i],
};

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
}

/**
 * Извлекает упомянутые в запросе section ids. Пустой массив — глобальная правка.
 */
export function extractTargetSections(userRequest: string): string[] {
  const text = userRequest.trim();
  if (!text) return [];

  const hits = new Set<string>();
  for (const [id, patterns] of Object.entries(SECTION_SYNONYMS)) {
    for (const p of patterns) {
      if (p.test(text)) {
        hits.add(id);
        break;
      }
    }
  }
  return Array.from(hits);
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

  // Структурные сигналы приоритетнее — даже один отправляет в full_rewrite.
  if (structuralHits >= 1) {
    return {
      intent: "full_rewrite",
      confidence: structuralHits >= 2 ? "high" : "medium",
      reason: `structural keywords: ${structuralHits}`,
      styleHits,
      structuralHits,
      targetSections,
    };
  }

  if (styleHits >= 1) {
    return {
      intent: "css_patch",
      confidence: styleHits >= 2 ? "high" : "medium",
      reason:
        targetSections.length > 0
          ? `style keywords: ${styleHits}, scoped to ${targetSections.join(", ")}`
          : `style keywords: ${styleHits}`,
      styleHits,
      structuralHits,
      targetSections,
    };
  }

  return {
    intent: "full_rewrite",
    confidence: "low",
    reason: "no signal, default to safe full rewrite",
    styleHits,
    structuralHits,
    targetSections,
  };
}
