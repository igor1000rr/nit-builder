/**
 * Extended eval queries (Tier 4): проверяют что Planner выдаёт
 * pricing_tiers/faq/hours_text/contact_phone когда запрос явно это предполагает.
 *
 * Без этих queries и соответствующих checks (has_X_when_expected) мы
 * не имеем численной метрики adoption расширенных полей PlanSchema. Сигнал
 * о регрессе (Планнер перестал выдавать pricing_tiers после изменения промпта)
 * останется невидимым.
 *
 * Каждый query прямо намекает хотя бы на одно расширенное поле через
 * ключевые слова:
 *   - pricing/тариф/прайс/планы/рассрочка → expectsPricing
 *   - FAQ/вопросы/частые/чаво → expectsFaq
 *   - часы/режим работы/открываем в X → expectsHours
 *   - телефон/адрес/физ. офис → expectsContactPhone
 */

import type { EvalQuery } from "./types";

export const EVAL_QUERIES_EXTENDED: EvalQuery[] = [
  {
    id: "ext-saas-pricing",
    query:
      "лендинг для SaaS аналитики с три тарифа starter pro enterprise от 2990 рублей в месяц",
    expectedNiche: "saas",
    expectsPricing: true,
    expectedKeywordsAny: ["SaaS", "аналитик", "тариф"],
  },
  {
    id: "ext-online-school-faq",
    query:
      "онлайн-курс SMM с ответами на частые вопросы про рассрочку и трудоустройство",
    expectedNiche: "online-school",
    expectsFaq: true,
    expectsPricing: true,
    expectedKeywordsAny: ["SMM", "курс", "трудоустройств"],
  },
  {
    id: "ext-dental-clinic-contact",
    query:
      "стоматологическая клиника на Арбате режим работы и телефон для записи частые вопросы пациентов",
    expectedNiche: "dental",
    expectsHours: true,
    expectsContactPhone: true,
    expectsFaq: true,
    expectedKeywordsAny: ["стоматолог", "запис"],
  },
  {
    id: "ext-fitness-tariffs-hours",
    query:
      "фитнес клуб с бассейном тарифы стандарт и вип работаем с 6 утра до полуночи телефон в футере",
    expectedNiche: "fitness",
    expectsPricing: true,
    expectsHours: true,
    expectsContactPhone: true,
    expectedKeywordsAny: ["фитнес", "бассейн", "тариф"],
  },
  {
    id: "ext-beauty-salon-pricing-hours",
    query:
      "салон красоты премиум сегмент цены стрижка окрашивание vip-день режим работы",
    expectedNiche: "beauty",
    expectsPricing: true,
    expectsHours: true,
    expectedKeywordsAny: ["салон", "красот", "окрашиван"],
  },
  {
    id: "ext-coffee-shop-hours-address",
    query:
      "кофейня в минске на Карла Маркса время работы и телефон для заказа зерна оптом",
    expectedNiche: "coffee-shop",
    expectsHours: true,
    expectsContactPhone: true,
    expectedKeywordsAny: ["кофе", "Минск"],
  },
  {
    id: "ext-ecommerce-pricing-faq",
    query:
      "интернет магазин электроники тарифы доставки стандарт экспресс и ответы на вопросы про гарантию",
    expectedNiche: "ecommerce",
    expectsPricing: true,
    expectsFaq: true,
    expectedKeywordsAny: ["электроник", "доставк", "гарант"],
  },
  {
    id: "ext-legal-faq-contact",
    query:
      "юристы по договорному праву частые вопросы по стоимости и контакты для консультации",
    expectedNiche: "legal",
    expectsFaq: true,
    expectsContactPhone: true,
    expectedKeywordsAny: ["юрист", "договор"],
  },
  {
    id: "ext-restaurant-hours-phone",
    query:
      "итальянский ресторан в центре Москвы работаем до полуночи бронь столиков по телефону",
    expectedNiche: "restaurant",
    expectsHours: true,
    expectsContactPhone: true,
    expectedKeywordsAny: ["ресторан", "итальян"],
  },
  {
    id: "ext-coworking-tariffs",
    query:
      "коворкинг в СПб тарифы от часа до месяца режим работы и вопросы про переговорки",
    expectedNiche: "coworking",
    expectsPricing: true,
    expectsHours: true,
    expectsFaq: true,
    expectedKeywordsAny: ["коворкинг", "тариф"],
  },
];
