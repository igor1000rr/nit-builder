/**
 * Компактное текстовое представление Plan для подмешивания в few-shot.
 *
 * Мотивация: JSON-сериализованный Plan занимает ~500-600 токенов на пример.
 * При k=2 это +1000-1200 input токенов на каждый Planner вызов. Компактный
 * формат даёт ~180-220 токенов на пример (2-3× компрессия) при сохранении
 * семантической читаемости моделью (TOON-style: ключи один раз, структура
 * через разделители).
 *
 * Формат стабилен и парсится моделью без проблем — Qwen 2.5 Coder в
 * экспериментах TOON late 2025 даже улучшает метрики на компактных данных
 * (73.9% vs 69.7% JSON в data retrieval бенчмарках).
 *
 * Несбалансированные/missing optional fields пропускаются. Длинные
 * description обрезаются по \n чтобы не ломать однострочный layout.
 *
 * Tier 4 (since v4): включает extended-поля (pricing_tiers/faq/hours_text/
 * contact_*) когда они есть в плане. Без этого Planner не видит примеры
 * extended-полей в few-shot блоке и редко их генерирует, даже если seeds
 * с ними есть в RAG-корпусе.
 */

import type { Plan } from "~/lib/utils/planSchema";

/** Сглаживает многострочные значения в одну строку для безопасной упаковки. */
function flatten(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Превращает Plan в компактную текстовую запись (5-20 строк).
 * Формат:
 *   business: ... | audience: ... | tone: ... | mood: ... | template: ...
 *   sections: a,b,c
 *   keywords: ...
 *   cta: Primary (microcopy)
 *   HERO: headline // subheadline
 *   BENEFITS:
 *     - Title → description
 *     - ...
 *   PROOF: social proof line
 *   PRICING:
 *     - TierName ★ (₽X / period): feature1 | feature2 | feature3
 *     - ...
 *   FAQ:
 *     - Q: question? A: answer
 *     - ...
 *   HOURS: 9:00-22:00
 *   CONTACT: +7..., email@x, address
 */
export function formatPlanCompact(plan: Plan): string {
  const lines: string[] = [];

  // Шапка одной строкой
  const headerParts: string[] = [
    `business: ${flatten(plan.business_type)}`,
    `audience: ${flatten(plan.target_audience)}`,
    `tone: ${flatten(plan.tone)}`,
    `mood: ${plan.color_mood}`,
    `template: ${plan.suggested_template_id}`,
  ];
  lines.push(headerParts.join(" | "));

  if (plan.sections.length > 0) {
    lines.push(`sections: ${plan.sections.join(",")}`);
  }

  if (plan.keywords.length > 0) {
    lines.push(`keywords: ${plan.keywords.join(", ")}`);
  }

  // CTA: Primary (microcopy)
  const ctaLine = plan.cta_microcopy
    ? `cta: ${plan.cta_primary} (${flatten(plan.cta_microcopy)})`
    : `cta: ${plan.cta_primary}`;
  lines.push(ctaLine);

  // HERO
  if (plan.hero_headline) {
    const sub = flatten(plan.hero_subheadline);
    lines.push(sub ? `HERO: ${plan.hero_headline} // ${sub}` : `HERO: ${plan.hero_headline}`);
  }

  // BENEFITS
  if (plan.key_benefits && plan.key_benefits.length > 0) {
    lines.push("BENEFITS:");
    for (const b of plan.key_benefits) {
      lines.push(`  - ${flatten(b.title)} → ${flatten(b.description)}`);
    }
  }

  // PROOF
  if (plan.social_proof_line) {
    lines.push(`PROOF: ${flatten(plan.social_proof_line)}`);
  }

  // ─── Tier 4 extended fields ───

  // PRICING
  if (plan.pricing_tiers && plan.pricing_tiers.length > 0) {
    lines.push("PRICING:");
    for (const t of plan.pricing_tiers) {
      const star = t.highlighted ? " ★" : "";
      const period = t.period ? ` / ${flatten(t.period)}` : "";
      const features = t.features.map(flatten).join(" | ");
      lines.push(`  - ${flatten(t.name)}${star} (${flatten(t.price)}${period}): ${features}`);
    }
  }

  // FAQ
  if (plan.faq && plan.faq.length > 0) {
    lines.push("FAQ:");
    for (const f of plan.faq) {
      lines.push(`  - Q: ${flatten(f.question)} A: ${flatten(f.answer)}`);
    }
  }

  // HOURS
  if (plan.hours_text) {
    lines.push(`HOURS: ${flatten(plan.hours_text)}`);
  }

  // CONTACT (одна строка с непустыми полями)
  const contactParts: string[] = [];
  if (plan.contact_phone) contactParts.push(flatten(plan.contact_phone));
  if (plan.contact_email) contactParts.push(flatten(plan.contact_email));
  if (plan.contact_address) contactParts.push(flatten(plan.contact_address));
  if (contactParts.length > 0) {
    lines.push(`CONTACT: ${contactParts.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Грубая оценка количества токенов в строке (для логов/метрик).
 * Использует приближение 1 токен ≈ 4 символа кириллицы. Для точности нужен
 * tokenizer модели, но для adaptive решений этого достаточно.
 */
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
