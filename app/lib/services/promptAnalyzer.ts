/**
 * Prompt analyzer — серверный "мини-planner" без LLM-вызовов.
 *
 * Извлекает из промпта структурированные хинты для обогащения Coder-промпта:
 *  - template (id + name + sections) — переложено из templateKeywordSelector
 *  - tone     — professional / playful / bold / elegant / minimal / friendly
 *  - colorHints — упомянутые цвета ("синий", "тёмный")
 *  - businessName — извлечённое имя (в кавычках или через фразу "кафе X")
 *  - extraSections — секции упомянутые юзером но не в template ("отзывы", "цены")
 *  - language — ru / en (по dominant script)
 *  - audience — "для детей", "для геймеров" (из паттерна "для X")
 *
 * Всё через regex/heuristics — детерминировано, без сетевых вызовов.
 * Это не заменяет полноценный LLM-planner (он остался в roadmap как
 * planner через туннель), но закрывает 80% кейсов: засчёт точных хинтов в
 * system prompt результат Coder'а разительно соответствует запросу (тёмный
 * лендинг с синим акцентом для компании "Nebula" — не пастельная кофейня).
 */

import { inferTemplateFromPrompt } from "./templateKeywordSelector";

export type Tone = "professional" | "playful" | "bold" | "elegant" | "minimal" | "friendly";

export type PromptAnalysis = {
  template: { id: string; name: string; sections: string[] };
  tone: Tone;
  colorHints: string[];
  businessName: string | null;
  extraSections: string[];
  language: "ru" | "en";
  audience: string | null;
};

// ─── Tone detection ───────────────────────────────────
//
// Ключевые слова по-русски и по-английски. Substring match, работает
// и для падежных форм ("строгий" → "строг" поймается и в "строгом",
// и в "строгое"). Если несколько tone-маркеров в промпте — выигрывает
// тот чьих больше (score).

const TONE_MARKERS: Record<Tone, string[]> = {
  professional: ["строг", "делов", "корпорат", "официал", "бизнес", "профессион", "юридич", "финанс", "b2b", "professional", "corporate", "business"],
  playful:      ["весёл", "игрив", "ярк", "забав", "прикол", "креатив", "детск", "мульти", "fun", "playful", "quirky", "funny", "cute"],
  bold:         ["смел", "дерз", "экспресс", "яркий акцент", "цепляющ", "крут", "панк", "рок", "жёстк", "bold", "edgy", "punk", "aggressive"],
  elegant:      ["элегант", "премиал", "роскош", "люкс", "изыскан", "утонч", "бутик", "высокий класс", "elegant", "luxury", "premium", "refined"],
  minimal:      ["минимал", "лаконич", "прост", "чист", "без лишнего", "minimal", "clean", "simple", "sparse"],
  friendly:     ["уют", "тёпл", "дружелюб", "добрый", "warm", "friendly", "cozy", "welcoming"],
};

function detectTone(promptLower: string): Tone {
  const scores: Partial<Record<Tone, number>> = {};
  for (const [tone, markers] of Object.entries(TONE_MARKERS)) {
    let s = 0;
    for (const m of markers) {
      if (promptLower.includes(m)) s++;
    }
    if (s > 0) scores[tone as Tone] = s;
  }

  let best: Tone = "friendly"; // дефолт — нейтрально-тёплый
  let bestScore = 0;
  for (const [tone, s] of Object.entries(scores)) {
    if (s > bestScore) {
      bestScore = s;
      best = tone as Tone;
    }
  }
  return best;
}

// ─── Color hints ──────────────────────────────────────

const COLOR_PATTERNS: Array<[string, string[]]> = [
  ["синий", ["син", "blue", "голуб"]],
  ["красный", ["красн", "red", "алый"]],
  ["зелёный", ["зелен", "зелён", "green"]],
  ["жёлтый", ["желт", "жёлт", "yellow"]],
  ["розовый", ["розов", "pink"]],
  ["фиолетовый", ["фиолет", "пурпур", "purple", "violet"]],
  ["оранжевый", ["оранж", "orange"]],
  ["чёрный", ["черн", "чёрн", "black"]],
  ["белый", ["белы", "white"]],
  ["тёмный", ["темн", "тёмн", "dark", "ночно"]],
  ["светлый", ["светл", "light", "пастель"]],
  ["золотой", ["золот", "gold"]],
];

function detectColors(promptLower: string): string[] {
  const found = new Set<string>();
  for (const [label, patterns] of COLOR_PATTERNS) {
    for (const p of patterns) {
      if (promptLower.includes(p)) {
        found.add(label);
        break;
      }
    }
  }
  return Array.from(found);
}

// ─── Business name extraction ────────────────────────
//
// Паттерны:
// 1. В кавычках "Название" или «Название» — самый надёжный индикатор
// 2. "кафе/школа/фирма X" — через слово-индикатор, принимаем 1-3 слова с большой буквы

const BUSINESS_INDICATORS = [
  "кафе", "кофейня", "кофейню", "ресторан", "пекарня",
  "школа", "студия", "студии", "салон", "магазин", "фирма", "компания",
  "барбершоп", "брэнд", "агентство", "бюро", "клуб",
];

function extractBusinessName(prompt: string): string | null {
  // 1. Кавычки — приоритет.
  const quoted = prompt.match(/["«“]([^"»”]{2,40})["»”]/);
  if (quoted && quoted[1]) return quoted[1].trim();

  // 2. "кафе Name" / "студия Name" — слово-индикатор + 1-3 слова с
  //    большой буквы. Нужен case-sensitive матч, потому что большая
  //    буква — сигнал имени собственного.
  for (const indicator of BUSINESS_INDICATORS) {
    // \p{L} в unicode режиме — любая буква включая кириллицу.
    const re = new RegExp(
      `${indicator}\\s+(\\p{Lu}\\p{L}+(?:\\s+\\p{Lu}\\p{L}+){0,2})`,
      "u",
    );
    const m = prompt.match(re);
    if (m && m[1]) return m[1].trim();
  }

  return null;
}

// ─── Extra sections ──────────────────────────────────
//
// Если юзер явно упомянул секцию которой нет в template.sections, добавляем
// её к extraSections. Coder получит продолженный список секций.

const SECTION_KEYWORDS: Record<string, string[]> = {
  testimonials: ["отзыв", "testimonial", "отклик"],
  pricing: ["цена", "цены", "тариф", "pricing", "price", "стоимост"],
  team: ["команд", "мастера", "персонал", "team"],
  faq: ["faq", "вопрос", "частые вопрос"],
  gallery: ["галерея", "фото", "gallery", "портфолио"],
  cta: ["cta", "call to action", "призыв"],
  newsletter: ["newsletter", "рассылк"],
  blog: ["блог", "blog", "новост"],
  map: ["карта", "map", "адрес"],
  contact: ["контакт", "contact", "связать"],
};

function detectExtraSections(promptLower: string, existing: string[]): string[] {
  const has = new Set(existing.map((s) => s.toLowerCase()));
  const extra: string[] = [];
  for (const [section, kws] of Object.entries(SECTION_KEYWORDS)) {
    if (has.has(section)) continue;
    for (const kw of kws) {
      if (promptLower.includes(kw)) {
        extra.push(section);
        break;
      }
    }
  }
  return extra;
}

// ─── Language detection ──────────────────────────────
//
// Простая эвристика: считаем кириллические vs латинские буквы.
// Если кириллицы больше или равно — ru (дефолт прода igor1000rr).

function detectLanguage(prompt: string): "ru" | "en" {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of prompt) {
    if (/[\u0400-\u04FF]/.test(ch)) cyrillic++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  return cyrillic >= latin ? "ru" : "en";
}

// ─── Audience extraction ─────────────────────────────
//
// Паттерн "для X" где X — 1-3 слова (несуществительные).

const AUDIENCE_STOP_WORDS = new Set([
  "того", "тех", "этого", "этих", "меня", "него", "неё", "нас", "тебя",
  "тогож", "себя", "тогото", "тогоже",
]);

function extractAudience(prompt: string): string | null {
  // "для детей" / "для геймеров" / "для начинающих английского"
  const m = prompt.toLowerCase().match(/для\s+([\p{L}]+(?:\s+[\p{L}]+){0,2})/u);
  if (!m || !m[1]) return null;
  const first = m[1].split(/\s+/)[0]!;
  if (AUDIENCE_STOP_WORDS.has(first)) return null;
  return m[1].trim();
}

// ─── Main entry point ────────────────────────────────

export function analyzePrompt(prompt: string): PromptAnalysis {
  const promptLower = prompt.toLowerCase();
  const template = inferTemplateFromPrompt(prompt);

  return {
    template,
    tone: detectTone(promptLower),
    colorHints: detectColors(promptLower),
    businessName: extractBusinessName(prompt),
    extraSections: detectExtraSections(promptLower, template.sections),
    language: detectLanguage(prompt),
    audience: extractAudience(prompt),
  };
}

/**
 * Строит обогащённый system prompt для Coder'а из анализа.
 *
 * Без analyzer: Coder получает только сырой промпт + имя темплейта —
 * выбирает тон, цвета, секции наобум. С analyzer всё явно — результат
 * воспроизводим и соответствует запросу.
 */
export function buildEnrichedSystemPrompt(prompt: string, a: PromptAnalysis): string {
  const allSections = [...a.template.sections, ...a.extraSections];
  const lang = a.language === "ru" ? "русском" : "английском";

  const hints: string[] = [];
  hints.push(`- Жанр: ${a.template.name}`);
  hints.push(`- Секции (в этом порядке): ${allSections.join(", ")}`);
  hints.push(`- Тон: ${toneDescription(a.tone)}`);
  if (a.colorHints.length > 0) {
    hints.push(`- Цветовые акценты: ${a.colorHints.join(", ")}`);
  }
  if (a.businessName) {
    hints.push(`- Название бренда: «${a.businessName}» (используй в hero + footer)`);
  }
  if (a.audience) {
    hints.push(`- Целевая аудитория: ${a.audience}`);
  }

  return `Ты — опытный HTML-разработчик. Создай полноценный одностраничный HTML-сайт по описанию: "${prompt}".

Характеристики:
${hints.join("\n")}

Технические требования:
- Начни с <!DOCTYPE html> и заверши </html>
- Tailwind CSS через CDN: <script src="https://cdn.tailwindcss.com"></script>
- Alpine.js для интерактива (опционально): <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
- Адаптивная вёрстка (mobile-first)
- Весь контент на ${lang} языке, заполни реалистичными фактами (без Lorem ipsum)
- Тон и палитра должны соответствовать характеристикам выше

Только HTML, без комментариев и объяснений.`;
}

function toneDescription(t: Tone): string {
  switch (t) {
    case "professional": return "строгий/деловой, сдержанные цвета, минимум декораций";
    case "playful":      return "весёлый/игривый, яркие цвета, закруглённые формы, emoji уместны";
    case "bold":         return "смелый/экспрессивный, контрастные цвета, крупные головни текста";
    case "elegant":      return "элегантный/премиальный, serif-шрифты, много воздуха, нейтральная палитра";
    case "minimal":      return "минимализм, много white-space, максимум 2 цвета, без градиентов";
    case "friendly":     return "тёплый/дружелюбный, мягкие цвета, приятный стиль";
  }
}
