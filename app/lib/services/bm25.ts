/**
 * BM25 (Okapi BM25) — лексический поиск для RAG параллельно dense embeddings.
 *
 * Зачем помимо dense:
 *   - dense embedding теряет точные термины: BMW, IELTS 7.0, M&A, КБЖУ,
 *     имена городов, версии продуктов, аббревиатуры
 *   - BM25 хорошо ловит редкие (высокий IDF) термины и точные совпадения
 *   - dense хорошо ловит семантические синонимы и перефразировки
 *   → их RRF-fusion даёт лучший recall чем любой с отдельности
 *
 * Формула (Okapi BM25, стандартные коэффициенты k1=1.5, b=0.75):
 *
 *   score(D, Q) = sum over t in Q of:
 *     IDF(t) * (f(t,D) * (k1+1)) / (f(t,D) + k1 * (1 - b + b * |D|/avgdl))
 *
 *   где IDF(t) = ln((N - n(t) + 0.5) / (n(t) + 0.5) + 1)
 *
 * In-memory inverted index: term → Map<docId, termFreq>. На 24 наших seed-доках
 * + 100 feedback-ingest = ~1000 уникальных терминов, индекс ~50KB в RAM,
 * поиск <2ms.
 *
 * Tokenizer:
 *   - Нормализация в lowercase
 *   - Разбиение по не-буквенным-не-цифровым (кроме - внутри слова)
 *   - Поддержка кириллицы + латиницы + цифры
 *   - Сохраняем термины с дефисом (b2b, кофе-на-вынос) и цифры (7.0, 450)
 *   - Мини-стемминг: режем хвосты -я/-и/-ы/-а/-ия у русских слов >5 букв
 *     ("кофейня" и "кофейню" → "кофейн"). Без polyglot стеммера чтобы не тянуть зависимость
 *   - Stop words: только очевидные предлоги/союзы. Слишком агрессивный stop list
 *     портит BM25 на коротких query (3-5 слов).
 *
 * Index immutable на время жизни процесса. Для addDocument при runtime нужен будет
 * инкрементальный апдейт — пока не нужен, seed и feedback индексируются
 * одновременно при старте.
 */

const K1 = 1.5;
const B = 0.75;

const RU_STOPWORDS = new Set([
  "и", "в", "на", "с", "по", "о", "об", "для", "из", "от", "к", "у", "за", "при",
  "под", "над", "перед", "между", "это", "этот", "эта", "то", "как", "но",
  "или", "а", "албо", "не", "нет", "бы", "был", "была", "были", "будет",
  "все", "всех", "всего", "всем", "что", "чтоб", "чтобы", "же", "ж", "ли",
  "бы", "ведь", "хотя", "их", "им", "их", "он", "она", "они", "мы", "вы", "я",
]);
const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with",
  "is", "are", "was", "were", "be", "been", "this", "that", "it", "as",
]);

/** Мини-стеммер для RU. Снимает частые окончания. Не пытаемся покрыть все случаи. */
function stemRussian(token: string): string {
  if (token.length <= 5) return token;
  // Порядок важен — длинные окончания снимаем раньше
  const suffixes = [
    "ями", "ях", "ия", "ея", "ью", "ии", "ии", "ев", "ов", "ым", "им",
    "ых", "их", "ыми", "ими", "ы", "и", "а", "я", "у", "ю", "е", "о", "ь",
  ];
  for (const s of suffixes) {
    if (token.endsWith(s) && token.length - s.length >= 4) {
      return token.slice(0, token.length - s.length);
    }
  }
  return token;
}

/** Tokenize текст в нормализованные термы. Публичная — используется в тестах. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  // Сплит по не-алфанумерикам, но сохраняем дефисы внутри слов и точки в числах
  // Пример: "BMW M3 под 7.0 баллов, b2b-сервис" → [bmw, m3, под, 7.0, баллов, b2b-сервис]
  const raw = lower
    .replace(/[^\p{L}\p{N}\-.]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const tok of raw) {
    // Чистим лидинг/трейлинг дефис и точки
    const cleaned = tok.replace(/^[-.]+|[-.]+$/g, "");
    if (cleaned.length < 2) continue;
    if (RU_STOPWORDS.has(cleaned) || EN_STOPWORDS.has(cleaned)) continue;
    // Только цифры без букв — важны (7.0, 2024, 450)
    if (/^[\d.]+$/.test(cleaned)) {
      out.push(cleaned);
      continue;
    }
    // Кириллица — применяем stemming
    if (/[а-яё]/.test(cleaned)) {
      out.push(stemRussian(cleaned));
    } else {
      out.push(cleaned);
    }
  }
  return out;
}

export type BM25Document = {
  id: string;
  text: string;
};

export type BM25Result = {
  id: string;
  score: number;
};

/**
 * In-memory BM25 индекс. Immutable после build.
 */
export class BM25Index {
  private termToDocs = new Map<string, Map<string, number>>();
  private docLengths = new Map<string, number>();
  private avgDocLength = 0;
  private totalDocs = 0;

  constructor(documents: BM25Document[]) {
    let totalLen = 0;
    for (const doc of documents) {
      const tokens = tokenize(doc.text);
      this.docLengths.set(doc.id, tokens.length);
      totalLen += tokens.length;

      const termFreq = new Map<string, number>();
      for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);

      for (const [term, freq] of termFreq) {
        let docs = this.termToDocs.get(term);
        if (!docs) {
          docs = new Map();
          this.termToDocs.set(term, docs);
        }
        docs.set(doc.id, freq);
      }
    }
    this.totalDocs = documents.length;
    this.avgDocLength = this.totalDocs > 0 ? totalLen / this.totalDocs : 0;
  }

  size(): number {
    return this.totalDocs;
  }

  /** BM25 score для query против всех docs. Сортирует desc, top-k. */
  search(query: string, k: number = 10): BM25Result[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0 || this.totalDocs === 0) return [];

    const scores = new Map<string, number>();
    for (const term of queryTerms) {
      const docs = this.termToDocs.get(term);
      if (!docs) continue;
      const idf = Math.log(
        (this.totalDocs - docs.size + 0.5) / (docs.size + 0.5) + 1,
      );
      for (const [docId, freq] of docs) {
        const docLen = this.docLengths.get(docId) ?? 0;
        const norm = 1 - B + B * (docLen / (this.avgDocLength || 1));
        const tf = (freq * (K1 + 1)) / (freq + K1 * norm);
        scores.set(docId, (scores.get(docId) ?? 0) + idf * tf);
      }
    }

    const results: BM25Result[] = [];
    for (const [id, score] of scores) results.push({ id, score });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}
