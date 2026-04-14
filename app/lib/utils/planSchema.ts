import { z } from "zod";

/**
 * Структурированный копирайт от Planner-а. Пусть планировщик
 * пишет готовые тексты вместо того чтобы Кодер фантазировал. Тексты копирайтерского
 * качества лучше выходят от Planner-а потому что у него маленький контекст
 * (всего запрос + каталог) и он фокусируется только на смысле. Кодер же держит
 * в контексте весь HTML-шаблон и часто скатывается к шаблонным фразам из исходника.
 */
const BenefitSchema = z.object({
  title: z.string().min(2).max(60),
  description: z.string().min(5).max(180),
});

export const PlanSchema = z.object({
  business_type: z.string().min(2).max(100),
  target_audience: z.string().max(200).default(""),
  tone: z.string().max(100).default("профессиональный"),
  style_hints: z.string().max(300).default(""),
  color_mood: z
    .enum([
      "warm-pastel",
      "cool-mono",
      "vibrant-neon",
      "dark-premium",
      "earth-natural",
      "light-minimal",
      "bold-contrast",
    ])
    .default("light-minimal"),
  sections: z.array(z.string()).min(1).max(12),
  keywords: z.array(z.string()).max(15).default([]),
  cta_primary: z.string().max(50).default("Связаться"),
  language: z.enum(["ru", "en", "by"]).default("ru"),
  suggested_template_id: z.string().min(1),

  // ───────────────────────────────────────────────────────────────────────
  // Копирайт от Planner-а (опциональный, backward-compat)
  // ───────────────────────────────────────────────────────────────────────

  /** Главный заголовок hero: короткая цепляющая фраза, 2-8 слов. */
  hero_headline: z.string().min(3).max(120).optional(),

  /** Подзаголовок hero: 1-2 предложения, раскрывающие выгоду. */
  hero_subheadline: z.string().max(300).optional(),

  /** 3-5 ключевых преимуществ для features/benefits-секции. */
  key_benefits: z.array(BenefitSchema).min(3).max(5).optional(),

  /** Короткий social-proof стэйтмент ("Нам доверяют 500+ семей"). */
  social_proof_line: z.string().max(150).optional(),

  /** Слова-магниты для CTA ("Бесплатно", "Без предоплаты", "За 24 часа"). */
  cta_microcopy: z.string().max(100).optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanBenefit = z.infer<typeof BenefitSchema>;

export function extractPlanJson(raw: string): unknown {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0) throw new Error("Plan JSON not found");
  return JSON.parse(cleaned.slice(first, last + 1));
}

/**
 * Собрать готовый копирайт из плана в текстовый блок для Coder-а.
 * Возвращает null если план не содержит ни одного копирайт-поля (legacy планы).
 */
export function buildCopyHint(plan: Plan): string | null {
  const parts: string[] = [];

  if (plan.hero_headline) {
    parts.push(`HERO HEADLINE (используй дословно): ${plan.hero_headline}`);
  }
  if (plan.hero_subheadline) {
    parts.push(`HERO SUBHEADLINE: ${plan.hero_subheadline}`);
  }
  if (plan.key_benefits && plan.key_benefits.length > 0) {
    const list = plan.key_benefits
      .map((b, i) => `  ${i + 1}. ${b.title} — ${b.description}`)
      .join("\n");
    parts.push(`KEY BENEFITS (для features/benefits-секции):\n${list}`);
  }
  if (plan.social_proof_line) {
    parts.push(`SOCIAL PROOF: ${plan.social_proof_line}`);
  }
  if (plan.cta_microcopy) {
    parts.push(`CTA MICROCOPY (маленький текст под кнопкой): ${plan.cta_microcopy}`);
  }

  if (parts.length === 0) return null;
  return `ГОТОВЫЙ КОПИРАЙТ ОТ ПЛАНИРОВЩИКА (вставь дословно в соответствующие места шаблона, не переписывай своими словами):\n${parts.join("\n")}`;
}
