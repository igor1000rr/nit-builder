/**
 * Классификатор намерений для Polisher.
 *
 * Задача: определить, можно ли обработать запрос юзера дешёвым CSS-патчем
 * (~200 токенов) или нужен полный rewrite всего HTML (~6000-12000 токенов).
 *
 * Дополнительно: детектирует sectionId — какую секцию упоминает юзер
 * ("герой", "секция цен", "футер"). Если sectionId есть — это позволяет:
 *   - scope-ограничить CSS-патч одной секцией
 *   - в будущем — делать section-level rewrite вместо full_rewrite
 */

export type PolishIntent = "css_patch" | "full_rewrite";

export type ClassificationResult = {
  intent: PolishIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  styleHits: number;
  structuralHits: number;
  /** Id упомянутой секции (hero, menu, etc), undefined если глобальная правка */
  sectionId?: string;
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
  /\bменю\b/i,
  /\bпрайс\w*/i,
  /\bцен(ы|ам|ник)\w*/i,
];

/**
 * Паттерны для детекта упоминания секции. Ключ — section id из канонического
 * набора (plan.sections). Покрывают RU/BY/EN варианты наименований секций.
 *
 * Проверяются в порядке объявления — первый match выигрывает, так что специфичные
 * паттерны сверху.
 */
const SECTION_ID_PATTERNS: [string, RegExp][] = [
  ["hero", /\b(геро(е|й|я|и)|hero|первый\s+экран|главный\s+экран|верхн(ий|яя)\s+блок|шапка|баннер)\b/i],
  ["footer", /\b(футер|подвал|footer)\b/i],
  ["pricing", /\b(цен|тариф|прайс|pricing|стоимост)\w*/i],
  ["menu", /\bменю\b/i],
  ["contact", /\b(контакт\w*|contact\w*)\b/i],
  ["about", /\b(о\s+нас|обо\s+мне|о\s+компани|about)\b/i],
  ["gallery", /\b(галерея|портфолио|gallery|работы)\b/i],
  ["services", /\b(услуг|сервис|services)\w*/i],
  ["testimonials", /\b(отзыв|testimonial|мнени)\w*/i],
  ["features", /\b(фичи|возможност|преимуществ|features)\w*/i],
  ["booking", /\b(запись|брон(ь|ирован)|booking)\w*/i],
  ["team", /\b(команда|team)\w*/i],
  ["masters", /\b(мастера?|masters)\b/i],
  ["cta", /\b(cta|призыв)\b/i],
  ["hours", /\b(час\w+\s+работ|режим\s+работ|hours)\b/i],
  ["location", /\b(адрес|локаци|карта|location)\w*/i],
  ["schedule", /\b(расписан(ие|ия)|программа|schedule)\b/i],
  ["tracks", /\b(треки|tracks|музыка)\b/i],
  ["events", /\b(ивенты|мероприят|events)\w*/i],
  ["doctors", /\b(врач|доктор|doctors)\w*/i],
  ["instructors", /\b(инструктор|instructors)\w*/i],
  ["classes", /\b(класс|занятия|classes)\w*/i],
  ["programs", /\b(программ|programs)\w*/i],
  ["skills", /\b(навыки?|skills)\b/i],
  ["projects", /\b(проекты?|projects)\b/i],
  ["story", /\b(история|story)\b/i],
  ["rsvp", /\b(rsvp|подтверждение\s+участ)\w*/i],
  ["order-form", /\b(форма\s+заказ|оформлен\w+\s+заказ|order)\w*/i],
  ["why-us", /\b(почему\s+мы|why\s+us)\b/i],
  ["how-it-works", /\b(как\s+мы\s+работ|how\s+it\s+works|этапы)\b/i],
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
}

/**
 * Детектирует упоминание конкретной секции в запросе. Возвращает
 * канонический id ("hero", "pricing", ...) или undefined.
 *
 * Если availableIds переданы — возвращает только id, которые реально
 * существуют в текущем HTML (избегаем detect="menu" когда меню нет).
 */
export function detectSectionId(
  userRequest: string,
  availableIds?: string[],
): string | undefined {
  const available = availableIds ? new Set(availableIds) : null;
  for (const [id, pattern] of SECTION_ID_PATTERNS) {
    if (pattern.test(userRequest)) {
      if (!available || available.has(id)) return id;
    }
  }
  return undefined;
}

export function classifyPolishIntent(
  userRequest: string,
  availableSectionIds?: string[],
): ClassificationResult {
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
  const sectionId = detectSectionId(text, availableSectionIds);

  if (structuralHits >= 1) {
    return {
      intent: "full_rewrite",
      confidence: structuralHits >= 2 ? "high" : "medium",
      reason: `structural keywords: ${structuralHits}${sectionId ? `, section=${sectionId}` : ""}`,
      styleHits,
      structuralHits,
      sectionId,
    };
  }

  if (styleHits >= 1) {
    return {
      intent: "css_patch",
      confidence: styleHits >= 2 ? "high" : "medium",
      reason: `style keywords: ${styleHits}${sectionId ? `, section=${sectionId}` : ""}`,
      styleHits,
      structuralHits,
      sectionId,
    };
  }

  return {
    intent: "full_rewrite",
    confidence: "low",
    reason: "no signal, default to safe full rewrite",
    styleHits,
    structuralHits,
    sectionId,
  };
}
