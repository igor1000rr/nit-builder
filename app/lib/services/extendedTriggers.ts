/**
 * Адаптивный few-shot retrieval boost для extended-полей Tier 4.
 *
 * Когда query содержит trigger-слова (тариф/FAQ/часы работы/телефон),
 * бустит RAG-кандидатов у которых в плане заполнены соответствующие
 * extended-поля (pricing_tiers / faq / hours_text / contact_*).
 *
 * Без триггеров — no-op, baseline retrieval не затрагивается.
 *
 * Триггер-словарь синхронизирован с PlannerSystemPrompt (commit 6ecf27d):
 * там Planner-у сказано "ВСЕГДА заполни pricing если в запросе есть
 * trigger-слово X", здесь мы говорим retrieval-у "выбирай примеры
 * с заполненным pricing когда видишь trigger-слово X". Без согласованной
 * пары Planner копирует структуру из few-shot без extended-полей и
 * adoption Tier 4 застревает.
 */

import type { Plan } from "~/lib/utils/planSchema";
import { logger } from "~/lib/utils/logger";

const SCOPE = "extendedTriggers";

export type ExtendedTriggers = {
  pricing: boolean;
  faq: boolean;
  hours: boolean;
  contact: boolean;
};

// ─── Триггер-словари ─────────────────────────────────────────────────────────
//
// substring match по lowercase + regex для шаблонов с числами и склонениями.
// Подбор слов покрывает формулировки в queriesExtended.ts и в htmlPrompts.ts.

const PRICING_SUBSTRS = [
  "тариф",
  "прайс",
  "цен",         // цена / цены / ценник
  "стоимост",    // стоимость / стоимости
  "руб/мес",
  "₽/мес",
  "рассрочк",
];
const PRICING_REGEX = /от\s+\d+\s*(руб|₽)/i;

const FAQ_SUBSTRS = [
  "faq",
  "частые вопрос",
  "ответы на вопрос",
  "чаво",
  "вопрос-ответ",
];

const HOURS_SUBSTRS = [
  "круглосуточн",
  "24/7",
];
// Покрывает все падежи: "режим работы", "режимом работы", "график работы",
// "графика работы", "часы работы", "часов работы" и т.д.
// \p{L}* + флаг u нужен потому что обычный \w* в JS не понимает кириллицу.
const HOURS_REGEX = /(?:реж\p{L}*|граф\p{L}*|час\p{L}*)\s+работ\p{L}*/iu;
const HOURS_WORK_FROM_REGEX = /работаем\s+с\s+\d/i;

const CONTACT_SUBSTRS = [
  "телефон",
  "позвонить",
  "адрес",
  "находимся",
  "приходите",
  "офис в ",
];

// ─── Detection ───────────────────────────────────────────────────────────────

export function detectExtendedTriggers(query: string): ExtendedTriggers {
  const lower = query.toLowerCase();
  return {
    pricing:
      PRICING_SUBSTRS.some((s) => lower.includes(s)) || PRICING_REGEX.test(query),
    faq: FAQ_SUBSTRS.some((s) => lower.includes(s)),
    hours:
      HOURS_SUBSTRS.some((s) => lower.includes(s)) ||
      HOURS_REGEX.test(query) ||
      HOURS_WORK_FROM_REGEX.test(query),
    contact: CONTACT_SUBSTRS.some((s) => lower.includes(s)),
  };
}

export function hasAnyTrigger(t: ExtendedTriggers): boolean {
  return t.pricing || t.faq || t.hours || t.contact;
}

// ─── Boost engine ────────────────────────────────────────────────────────────

function isBoostEnabled(): boolean {
  return process.env.NIT_EXTENDED_TRIGGER_BOOST_ENABLED !== "0";
}

function getBoostAmount(): number {
  const raw = process.env.NIT_EXTENDED_TRIGGER_BOOST_AMOUNT;
  if (!raw) return 0.1;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0 || n > 1) return 0.1;
  return n;
}

/**
 * Сколько extended-полей в плане матчат триггеры query.
 * 0 если ни одного, 1..4 если есть совпадения.
 */
export function countTriggerMatches(
  plan: Plan | undefined,
  triggers: ExtendedTriggers,
): number {
  if (!plan) return 0;
  let matches = 0;
  if (triggers.pricing && plan.pricing_tiers && plan.pricing_tiers.length > 0) {
    matches++;
  }
  if (triggers.faq && plan.faq && plan.faq.length > 0) {
    matches++;
  }
  if (triggers.hours && plan.hours_text && plan.hours_text.trim().length > 0) {
    matches++;
  }
  if (
    triggers.contact &&
    ((plan.contact_phone && plan.contact_phone.trim().length > 0) ||
      (plan.contact_email && plan.contact_email.trim().length > 0) ||
      (plan.contact_address && plan.contact_address.trim().length > 0))
  ) {
    matches++;
  }
  return matches;
}

export type ScoredCandidate<T> = {
  result: T;
  finalScore: number;
};

export type CandidatePlanProvider<T> = (c: T) => Plan | undefined;

export type BoostResult<T> = {
  candidates: Array<ScoredCandidate<T>>;
  boostedCount: number;
};

/**
 * Применяет boost к scored-кандидатам: за каждый matched extended-trigger
 * даёт +BOOST_AMOUNT к finalScore. Возвращает новую отсортированную копию.
 *
 * No-op если: триггеров нет / kill-switch выключен / boost=0 / candidates пуст.
 */
export function applyExtendedTriggerBoost<T>(
  candidates: Array<ScoredCandidate<T>>,
  triggers: ExtendedTriggers,
  getPlan: CandidatePlanProvider<T>,
): BoostResult<T> {
  if (!isBoostEnabled() || !hasAnyTrigger(triggers) || candidates.length === 0) {
    return { candidates, boostedCount: 0 };
  }

  const boost = getBoostAmount();
  if (boost === 0) return { candidates, boostedCount: 0 };

  let boostedCount = 0;
  const result = candidates.map((c) => {
    const plan = getPlan(c.result);
    const matches = countTriggerMatches(plan, triggers);
    if (matches === 0) return c;
    boostedCount++;
    return { ...c, finalScore: c.finalScore + boost * matches };
  });

  // Stable sort by finalScore desc — при равенстве сохраняется исходный порядок.
  result.sort((a, b) => b.finalScore - a.finalScore);

  if (boostedCount > 0) {
    const triggerStr = (Object.keys(triggers) as Array<keyof ExtendedTriggers>)
      .filter((k) => triggers[k])
      .join(",");
    logger.info(
      SCOPE,
      `Boosted ${boostedCount}/${candidates.length} candidates with +${boost} per match (triggers: ${triggerStr})`,
    );
  } else {
    // Сигнал что seed-корпусу не хватает extended-планов под этот запрос.
    const triggerStr = (Object.keys(triggers) as Array<keyof ExtendedTriggers>)
      .filter((k) => triggers[k])
      .join(",");
    logger.info(
      SCOPE,
      `No candidates matched triggers (${triggerStr}) among ${candidates.length} — seeds may be missing extended fields for this niche`,
    );
  }

  return { candidates: result, boostedCount };
}
