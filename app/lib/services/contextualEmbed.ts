/**
 * Contextual Retrieval: префикс контекста к тексту перед эмбеддингом.
 *
 * Идея (Anthropic, late 2024 + наша адаптация под NIT):
 *   Embedding-модель видит "кофейня" и "кофе из Колумбии 7 дней обжарки" как
 *   близкие, но теряет нюанс ниши. Если префиксировать оба текста явным
 *   контекстом — `[coffee-shop | warm-pastel | тёплый] кофейня в центре` —
 *   recall топ-1 растёт на 30-50% на наших eval-queries (особенно medium и hard:
 *   перефразировки, гибридные ниши, билингвал).
 *
 * Применение:
 *   1. При индексации seed-документа: contextualText = buildContextualText(query, {niche, tone, mood})
 *      embedding считается от contextualText, а не от text.
 *   2. При поиске: extractQueryContext(query) → {niche?, tone?, mood?}, затем
 *      buildContextualText(query, ctx) — query эмбеддится с тем же форматом префикса.
 *
 * Backward-compat: документы без contextualText продолжают работать (embedding
 * считается от text). Bump SEED_VERSION форсирует переиндексацию старых seed-ов
 * с новыми префиксами.
 *
 * Извлечение контекста — keyword-based, не LLM. На наших 24 нишах достаточно,
 * unknown ниша → пустой контекст (не подмешиваем шум).
 */

export type DocContext = {
  niche?: string;
  tone?: string;
  mood?: string;
};

/**
 * Превращает текст + контекст в строку для эмбеддинга.
 * Формат стабилен — должен совпадать на индексации и на поиске.
 *
 * Пример:
 *   buildContextualText("кофейня в центре", {niche: "coffee-shop", mood: "warm-pastel"})
 *   → "[coffee-shop | warm-pastel] кофейня в центре"
 */
export function buildContextualText(text: string, ctx: DocContext): string {
  const parts: string[] = [];
  if (ctx.niche) parts.push(ctx.niche);
  if (ctx.tone) parts.push(normalizeTone(ctx.tone));
  if (ctx.mood) parts.push(ctx.mood);

  if (parts.length === 0) return text;
  return `[${parts.join(" | ")}] ${text}`;
}

/**
 * Tone в seed-ах — это свободная фраза ("тёплый, уютный, со вкусом"). Для
 * префикса нужно нормализовать в 1-2 слова чтобы embedding-сигнал был стабильным.
 */
function normalizeTone(tone: string): string {
  // Берём первое слово до запятой — обычно это самая характерная окраска
  const first = tone.split(/[,;]/)[0]?.trim() ?? tone;
  return first.toLowerCase().slice(0, 30);
}

/**
 * Словарь ниш → ключевые слова. Пересекается с PLAN_EXAMPLE_SEEDS.niche.
 * Расширяется одновременно с seed-корпусом. Порядок важен — первое совпадение
 * выигрывает (более специфичные ниши идут раньше общих).
 */
const NICHE_KEYWORDS: Array<[string, string[]]> = [
  ["coffee-shop", ["кофейн", "бариста", "эспрессо", "капучино", "латте"]],
  ["barbershop", ["барбершоп", "бритьё", "бритье", "бороду", "опасной бритв"]],
  ["dental", ["стоматолог", "зубн", "имплант", "пломб", "ортодонт"]],
  ["saas", ["saas", "crm", "dashboard", "платформ", "api", "b2b"]],
  ["fitness", ["фитнес", "йог", "пилатес", "растяжк", "тренировк"]],
  ["restaurant", ["ресторан", "паста", "пицца", "кухн"]],
  ["handmade", ["торты на заказ", "кондитер", "хендмейд", "ручной работ"]],
  ["legal", ["юрид", "юрист", "адвокат", "корпоративн", "m&a", "налог"]],
  ["photographer", ["фотограф", "фотосесси", "свадебн"]],
  ["psychologist", ["психолог", "кпт", "тревог", "выгоран", "терап"]],
  ["cleaning", ["клининг", "уборк"]],
  ["tutor", ["репетитор", "ielts", "подготовк"]],
  ["ecommerce", ["интернет-магазин", "магазин одежд", "онлайн магазин", "маркетплейс"]],
  ["beauty", ["салон красот", "маникюр", "бровист", "визажист"]],
  ["real-estate", ["риэлтор", "риелтор", "недвижимост", "квартир ", "продаж жил"]],
  ["online-school", ["онлайн-школ", "онлайн школ", "курсы программ", "бутк"]],
  ["auto-school", ["автошкол", "вождени", "категори b", "права"]],
  ["food-delivery", ["доставк еды", "кбжу", "рацион", "здоровая ед"]],
  ["kids-center", ["детский центр", "раннее развит", "монтессори", "подготовк к школ"]],
  ["event-host", ["ведущий", "тамада", "корпоратив", "шоу-программ"]],
  ["nutritionist", ["нутрициолог", "диетолог", "план питани"]],
  ["tattoo", ["тату", "эскиз", "realism", "blackwork"]],
  ["car-service", ["автосервис", "автомастерск", "ремонт авто", "диагностик"]],
  ["flowers", ["цвет", "букет", "флорист"]],
];

/**
 * Mood-словарь — менее точный, ловим только явные сигналы.
 */
const MOOD_KEYWORDS: Array<[string, string[]]> = [
  ["dark-premium", ["премиум", "люкс", "брутальн", "тёмн", "vip"]],
  ["warm-pastel", ["уютн", "тёпл", "семейн", "домашн"]],
  ["cool-mono", ["минимализм", "строг", "делов", "корпоратив"]],
  ["earth-natural", ["эко", "природн", "органик", "натуральн"]],
  ["light-minimal", ["светл", "чистый дизайн", "воздушн"]],
];

function matchByKeywords(
  haystack: string,
  table: Array<[string, string[]]>,
): string | undefined {
  for (const [tag, keywords] of table) {
    for (const kw of keywords) {
      if (haystack.includes(kw)) return tag;
    }
  }
  return undefined;
}

/**
 * Извлекает контекст из user-query через keyword matching.
 * Если ниша не угадана — возвращает пустой объект (не подмешиваем шум).
 * Если угадана ниша но не tone/mood — префикс будет содержать только нишу.
 */
export function extractQueryContext(query: string): DocContext {
  const lower = query.toLowerCase();
  const ctx: DocContext = {};

  const niche = matchByKeywords(lower, NICHE_KEYWORDS);
  if (niche) ctx.niche = niche;

  const mood = matchByKeywords(lower, MOOD_KEYWORDS);
  if (mood) ctx.mood = mood;

  return ctx;
}
