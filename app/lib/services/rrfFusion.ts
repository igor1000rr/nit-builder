/**
 * Reciprocal Rank Fusion (RRF) — объединение нескольких ranking lists в один.
 *
 * Формула (Cormack et al, 2009):
 *   RRF_score(d) = sum over rankings of: 1 / (k + rank(d))
 *
 * Где k=60 — стандартная константа (снижает влияние выбросов в ranking).
 *
 * Плюсы перед взвешенным суммированием нормализованных scores:
 *   - Не требует нормализации (cosine 0..1, BM25 0..unbounded)
 *   - Не требует weight tuning («сколько веса dense vs sparse?»)
 *   - Робастный к выбросам в любом из ranking-ов
 *   - По бенчмаркам TREC и BEIR — стабильно в топ-3 fusion-стратегий
 *
 * Pure function, easy testable.
 */

export type Ranking = string[];

export type RrfResult = {
  id: string;
  rrfScore: number;
};

const DEFAULT_K = 60;

/**
 * Объединяет несколько ranking-ов через RRF.
 *
 * @param rankings - массив ranking-ов, каждый — упорядоченный массив docId (лучший первый)
 * @param k - константа RRF (default 60)
 * @returns массив {id, rrfScore} отсортированный desc по rrfScore
 */
export function reciprocalRankFusion(
  rankings: Ranking[],
  k: number = DEFAULT_K,
): RrfResult[] {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]!;
      // rank 1-indexed в RRF (первый элемент имеет rank=1)
      const contribution = 1 / (k + rank + 1);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    }
  }

  const result: RrfResult[] = [];
  for (const [id, rrfScore] of scores) result.push({ id, rrfScore });
  result.sort((a, b) => b.rrfScore - a.rrfScore);
  return result;
}
