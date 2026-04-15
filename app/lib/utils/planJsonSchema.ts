/**
 * JSON Schema (Draft-07) ручной зеркальный вывод из PlanSchema (zod).
 *
 * Почему ручной вместо zod-to-json-schema:
 *   - Избегаем ещё одной зависимости в production bundle
 *   - Полный контроль над форматом (XGrammar в LM Studio строго любит
 *     additionalProperties:false и явные required поля)
 *   - Проще диагностировать расхождения со schema-ошибками (одно место правки)
 *
 * Должен оставаться синхронным с PlanSchema. При изменениях схемы ОБЯЗАТЕЛЬНО
 * обновить этот файл. Есть рунтайм-проверка в constrainedPlanGen: вывод проходит
 * через PlanSchema.safeParse, и расхождение логгируется как zod_mismatch.
 */

export const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    business_type: { type: "string", minLength: 2, maxLength: 100 },
    target_audience: { type: "string", maxLength: 200 },
    tone: { type: "string", maxLength: 100 },
    style_hints: { type: "string", maxLength: 300 },
    color_mood: {
      type: "string",
      enum: [
        "warm-pastel",
        "cool-mono",
        "vibrant-neon",
        "dark-premium",
        "earth-natural",
        "light-minimal",
        "bold-contrast",
      ],
    },
    sections: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 12,
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      maxItems: 15,
    },
    cta_primary: { type: "string", maxLength: 50 },
    language: { type: "string", enum: ["ru", "en", "by"] },
    suggested_template_id: { type: "string", minLength: 1 },

    // Optional copy fields
    hero_headline: { type: "string", minLength: 3, maxLength: 120 },
    hero_subheadline: { type: "string", maxLength: 300 },
    key_benefits: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 2, maxLength: 60 },
          description: { type: "string", minLength: 5, maxLength: 180 },
        },
        required: ["title", "description"],
      },
    },
    social_proof_line: { type: "string", maxLength: 150 },
    cta_microcopy: { type: "string", maxLength: 100 },
  },
  required: [
    "business_type",
    "target_audience",
    "tone",
    "style_hints",
    "color_mood",
    "sections",
    "keywords",
    "cta_primary",
    "language",
    "suggested_template_id",
    "hero_headline",
    "hero_subheadline",
    "key_benefits",
    "social_proof_line",
    "cta_microcopy",
  ],
} as const;
