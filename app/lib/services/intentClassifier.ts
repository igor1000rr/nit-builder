/**
 * Классификатор намерений для Polisher.
 *
 * Задача: определить, можно ли обработать запрос юзера дешёвым CSS-патчем
 * (~200 токенов) или нужен полный rewrite всего HTML (~6000-12000 токенов).
 *
 * Запросы вида "сделай фон синим", "увеличь заголовки", "в тёмную тему" — это
 * css_patch. Запросы "добавь секцию отзывы", "убери блок цен", "перепиши текст
 * в герое" — full_rewrite, CSS их не решит.
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
};

/**
 * Сигналы в пользу CSS-патча (визуальные свойства).
 * Покрывает русский, беларусский и английский варианты.
 */
const STYLE_PATTERNS: RegExp[] = [
  // Цвета
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

  // Фон
  /\bфон\w*/i,
  /\bbackground\b/i,
  /\bbg-/i,

  // Размеры/отступы
  /\bкрупн\w*/i,
  /\bмельч\w*/i,
  /\bпомельче/i,
  /\bпокрупнее/i,
  /\bменьш\w*/i,
  /\bбольш\w*/i, // ПОДОЗРИТЕЛЬНО: "больше секций" structural — решается приоритетом structural.
  /\bшире\b/i,
  /\bуже\b/i,
  /\bотступ\w*/i,
  /\bpadding\b/i,
  /\bmargin\b/i,
  /\bgap\b/i,
  /\bинтервал\w*/i,
  /\bвысот\w*/i,
  /\bширин\w*/i,

  // Шрифты
  /\bшрифт\w*/i,
  /\bfont\b/i,
  /\bжирн\w*/i,
  /\bbold\b/i,
  /\bкурсив\w*/i,
  /\bitalic\b/i,
  /\bподч[её]ркн\w*/i,

  // Эффекты
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

  // Общие визуальные
  /\bдизайн\w*/i,
  /\bтем(а|у|ы)\b/i,
  /\bстил(ь|ем|я)\w*/i,
  /\bвид\b/i,
  /\bкнопк\w*/i, // "сделай кнопки круглыми" — style
];

/**
 * Сигналы в пользу полного rewrite (структура/контент). Приоритетнее style.
 */
const STRUCTURAL_PATTERNS: RegExp[] = [
  // Добавление/удаление блоков
  /\bдобав(ь|и|ить|ление|им)/i,
  /\bвстав(ь|ить|ка|им)/i,
  /\bсоздай\w*/i,
  /\bубер(и|ите|ём)/i,
  /\bудал(и|ить|ите|яем|им)/i,
  /\bвыкин(ь|и|уть)/i,
  /\bremove\b/i,
  /\badd\b/i,

  // Секции/блоки
  /\bсекци\w*/i,
  /\bблок\w*/i,
  /\bsection\b/i,
  /\bbanner\b/i,
  /\bбаннер\w*/i,

  // Текстовые правки
  /\bперепиш\w*/i,
  /\bпереименуй/i,
  /\bзамени\s+(текст|заголов|слов)/i,
  /\bизмени\s+(текст|заголов|слов)/i,
  /\bновый\s+(текст|заголов)/i,
  /\bнапиши\b/i,
  /\bпридумай\w*/i,
  /\bпредложи\w*/i,

  // Перемещение
  /\bперенес(и|ти)/i,
  /\bперестав(ь|ить)/i,
  /\bпоменяй\s+места?/i,
  /\bswap\b/i,
  /\bmove\b/i,

  // Контент
  /\bсодерж\w*/i,
  /\bконтент\w*/i,
  /\bменю\b/i,
  /\bпрайс\w*/i,
  /\bцен(ы|ам|ник)\w*/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) if (p.test(text)) count++;
  return count;
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

  // Структурные сигналы приоритетнее — даже один отправляет в full_rewrite.
  if (structuralHits >= 1) {
    return {
      intent: "full_rewrite",
      confidence: structuralHits >= 2 ? "high" : "medium",
      reason: `structural keywords: ${structuralHits}`,
      styleHits,
      structuralHits,
    };
  }

  // Чистые style-сигналы — можно CSS-патч.
  if (styleHits >= 1) {
    return {
      intent: "css_patch",
      confidence: styleHits >= 2 ? "high" : "medium",
      reason: `style keywords: ${styleHits}`,
      styleHits,
      structuralHits,
    };
  }

  // Ничего не распознали — безопасный default в full_rewrite.
  return {
    intent: "full_rewrite",
    confidence: "low",
    reason: "no signal, default to safe full rewrite",
    styleHits,
    structuralHits,
  };
}
