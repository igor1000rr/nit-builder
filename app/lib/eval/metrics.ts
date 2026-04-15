/**
 * Автометрики качества плана. Все checkers — pure functions без LLM-judge.
 *
 * Принцип: проверяем формальные требования (длины, диапазоны, регексы),
 * а не содержательное "красиво ли написано". LLM-judge оставлен на потом —
 * пока хватает того что эти метрики ловят основные регрессии:
 *   - сломанная схема
 *   - короткие/длинные поля
 *   - штампованный копирайт без конкретики
 *   - отсутствие proof / reassurance
 *   - промах по ожидаемым секциям/template
 *   - Tier 4: adoption pricing/faq/hours/contact когда запрос их явно ожидает
 */

import { PlanSchema, type Plan } from "~/lib/utils/planSchema";
import type { EvalQuery, MetricCheck } from "./types";

const BANNED_PHRASES = [
  "качество",
  "профессионализм",
  "индивидуальный подход",
  "добро пожаловать",
  "наша миссия",
  "квалифицированные специалисты",
  "многолетний опыт",
  "всегда рады",
  "оптимальное соотношение",
  "гибкая система",
  "лучшие цены",
  "широкий спектр",
  "высококвалифицированные",
  "высочайший",
  "первоклассные",
  "безупречн",
] as const;

const NUMERIC_FACT_RE =
  /\d+\s*(\+|лет|год|месяц|дней|дня|час|минут|сек|раз|%|₽|руб|чел|шт|км|м²|м2)/i;

const REASSURANCE_RE =
  /бесплатн|без\s+(оплат|штраф|кар|обяз|предоплат)|гарант|возврат|0\s*₽|0\s+руб|первая.+бесплат|консультац.+бесплат/i;

function containsAny(text: string, needles: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return needles.filter((n) => lower.includes(n));
}

function countNumericFacts(text: string): number {
  if (!text) return 0;
  const matches = text.match(new RegExp(NUMERIC_FACT_RE.source, "gi"));
  return matches?.length ?? 0;
}

export function evaluatePlan(plan: Plan, query: EvalQuery): MetricCheck[] {
  const checks: MetricCheck[] = [];

  // 1. Schema validity
  const parsed = PlanSchema.safeParse(plan);
  checks.push({
    name: "plan_schema_valid",
    passed: parsed.success,
    detail: parsed.success ? undefined : parsed.error.errors.map((e) => e.message).join("; "),
  });

  // 2. Hero headline
  const heroLen = plan.hero_headline?.length ?? 0;
  checks.push({
    name: "hero_length_ok",
    passed: heroLen >= 3 && heroLen <= 120,
    value: heroLen,
    detail: heroLen === 0 ? "hero_headline отсутствует" : undefined,
  });

  // 3. Subheadline
  if (plan.hero_subheadline !== undefined) {
    const subLen = plan.hero_subheadline.length;
    checks.push({
      name: "subheadline_length_ok",
      passed: subLen <= 300,
      value: subLen,
    });
  }

  // 4. Benefits count
  const benefitsCount = plan.key_benefits?.length ?? 0;
  checks.push({
    name: "benefits_count_ok",
    passed: benefitsCount >= 3 && benefitsCount <= 5,
    value: benefitsCount,
  });

  // 5. Каждый benefit
  if (plan.key_benefits && plan.key_benefits.length > 0) {
    const allTitlesOk = plan.key_benefits.every(
      (b) => b.title.length >= 2 && b.title.length <= 60,
    );
    const allDescOk = plan.key_benefits.every(
      (b) => b.description.length >= 5 && b.description.length <= 180,
    );
    checks.push({ name: "benefit_titles_ok", passed: allTitlesOk });
    checks.push({ name: "benefit_descriptions_ok", passed: allDescOk });
  }

  // 6. Banned phrases
  const allCopyText = [
    plan.hero_headline ?? "",
    plan.hero_subheadline ?? "",
    ...(plan.key_benefits?.flatMap((b) => [b.title, b.description]) ?? []),
    plan.social_proof_line ?? "",
    plan.cta_microcopy ?? "",
  ].join(" ");
  const foundBanned = containsAny(allCopyText, BANNED_PHRASES);
  checks.push({
    name: "no_banned_phrases",
    passed: foundBanned.length === 0,
    value: foundBanned.length,
    detail: foundBanned.length > 0 ? `найдено: ${foundBanned.join(", ")}` : undefined,
  });

  // 7. Numeric facts
  const benefitsText =
    plan.key_benefits?.map((b) => `${b.title} ${b.description}`).join(" ") ?? "";
  const numericFactsCount = countNumericFacts(benefitsText);
  checks.push({
    name: "benefits_have_numeric_facts",
    passed: numericFactsCount >= 1,
    value: numericFactsCount,
    detail: numericFactsCount === 0 ? "ни одного числового факта в benefits" : undefined,
  });

  // 8. Social proof number
  if (plan.social_proof_line) {
    const hasNumber = /\d+/.test(plan.social_proof_line);
    checks.push({
      name: "social_proof_has_number",
      passed: hasNumber,
      detail: hasNumber ? undefined : `"${plan.social_proof_line}"`,
    });
  }

  // 9. Microcopy reassurance
  if (plan.cta_microcopy) {
    const hasReassurance = REASSURANCE_RE.test(plan.cta_microcopy);
    checks.push({
      name: "microcopy_has_reassurance",
      passed: hasReassurance,
      detail: hasReassurance ? undefined : `"${plan.cta_microcopy}"`,
    });
  }

  // 10. mustHaveSections
  if (query.mustHaveSections && query.mustHaveSections.length > 0) {
    const hit = query.mustHaveSections.filter((s) => plan.sections.includes(s));
    const allFound = hit.length === query.mustHaveSections.length;
    checks.push({
      name: "must_have_sections",
      passed: allFound,
      value: hit.length,
      detail: allFound
        ? undefined
        : `не хватает: ${query.mustHaveSections.filter((s) => !plan.sections.includes(s)).join(", ")}`,
    });
  }

  // 11. expectedKeywordsAny
  if (query.expectedKeywordsAny && query.expectedKeywordsAny.length > 0) {
    const planKwLower = plan.keywords.map((k) => k.toLowerCase());
    const expectedLower = query.expectedKeywordsAny.map((k) => k.toLowerCase());
    const hit = expectedLower.some((exp) =>
      planKwLower.some((kw) => kw.includes(exp) || exp.includes(kw)),
    );
    checks.push({
      name: "keywords_match_any",
      passed: hit,
      detail: hit
        ? undefined
        : `план: [${plan.keywords.join(", ")}], ожидалось одно из: [${query.expectedKeywordsAny.join(", ")}]`,
    });
  }

  // 12. expectedTemplateId
  if (query.expectedTemplateId) {
    checks.push({
      name: "template_match",
      passed: plan.suggested_template_id === query.expectedTemplateId,
      detail:
        plan.suggested_template_id === query.expectedTemplateId
          ? undefined
          : `выбран ${plan.suggested_template_id}, ожидался ${query.expectedTemplateId}`,
    });
  }

  // ─── Tier 4: extended-fields adoption checks ───
  // Проверяем только если query явно ожидает соответствующее поле.
  // Для queries без expects* эти checks не добавляются — не влияет на baseline.

  if (query.expectsPricing) {
    const tiersCount = plan.pricing_tiers?.length ?? 0;
    checks.push({
      name: "has_pricing_tiers_when_expected",
      passed: tiersCount >= 2,
      value: tiersCount,
      detail:
        tiersCount >= 2
          ? undefined
          : `запрос явно хочет тарифы, план дал ${tiersCount}`,
    });
  }

  if (query.expectsFaq) {
    const faqCount = plan.faq?.length ?? 0;
    checks.push({
      name: "has_faq_when_expected",
      passed: faqCount >= 3,
      value: faqCount,
      detail:
        faqCount >= 3
          ? undefined
          : `запрос явно хочет FAQ, план дал ${faqCount}`,
    });
  }

  if (query.expectsHours) {
    const hasHours = !!plan.hours_text && plan.hours_text.length >= 3;
    checks.push({
      name: "has_hours_when_expected",
      passed: hasHours,
      detail: hasHours ? undefined : `hours_text отсутствует или слишком короткий`,
    });
  }

  if (query.expectsContactPhone) {
    const hasPhone = !!plan.contact_phone && plan.contact_phone.length >= 7;
    checks.push({
      name: "has_contact_phone_when_expected",
      passed: hasPhone,
      detail: hasPhone ? undefined : `contact_phone отсутствует или слишком короткий`,
    });
  }

  return checks;
}

export function getCheckValue(checks: MetricCheck[], name: string): number | undefined {
  return checks.find((c) => c.name === name)?.value;
}

export function checkPassed(checks: MetricCheck[], name: string): boolean {
  return checks.find((c) => c.name === name)?.passed ?? false;
}
