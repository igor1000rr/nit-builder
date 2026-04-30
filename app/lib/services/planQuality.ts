import { getTemplateById } from "~/lib/config/htmlTemplatesCatalog";
import type { Plan } from "~/lib/utils/planSchema";

const BANNED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/добро пожаловать/gi, "Здесь решают задачу без лишней суеты"],
  [/наша миссия/gi, "Наш фокус"],
  [/индивидуальный подход/gi, "План под задачу за 15 минут"],
  [/качество/gi, "предсказуемый результат"],
  [/профессионализм/gi, "опыт команды"],
  [/квалифицированные специалисты/gi, "профильные эксперты"],
  [/многолетний опыт/gi, "проверенный процесс"],
  [/широкий спектр/gi, "понятный набор"],
  [/лучшие цены/gi, "прозрачные цены"],
  [/безупречн\w*/gi, "аккуратные"],
];

const SECTION_RULES: Array<{ pattern: RegExp; sections: string[] }> = [
  { pattern: /кофе|кофейн|кафе|ресторан|пицц|паста|пекарн|хлеб|бариста|пиво|пивовар|тапрум|brewery/i, sections: ["menu"] },
  { pattern: /фитнес|йог|пилатес|растяж|трениров|ретрит|танц|курс|школ|репетитор|ielts|урок|детск|развивающ|центр для детей|нутрициолог|питани|кбжу/i, sections: ["programs"] },
  { pattern: /saas|b2b|аналитик|сервис|приложен|стартап|crm/i, sections: ["features"] },
  { pattern: /стомат|клиник|врач|лечен|барбер|стриж|брить|юрист|адвокат|клининг|уборк|химчист|реставрац|мебел|диван|ковр|массаж|ветеринар|автосервис|ремонт/i, sections: ["services"] },
  { pattern: /фото|фотк|портфолио|галере|работ/i, sections: ["gallery"] },
  { pattern: /архитектур|интерьер|частные дома|авторск/i, sections: ["gallery"] },
  { pattern: /тариф|прайс|цен[аы]|стоимост|₽|руб|рассрочк|аренд|за\s+\d+\s*(час|часа|минут)/i, sections: ["pricing"] },
  { pattern: /запис|заброни|бронь|при[её]м|консультац/i, sections: ["booking"] },
  { pattern: /телефон|адрес|контакт|позвон|находимся|офис/i, sections: ["contact"] },
  { pattern: /faq|частые вопросы|ответы на вопросы|чаво|вопрос-ответ/i, sections: ["faq"] },
  { pattern: /часы работы|режим работы|график|работаем|круглосуточно|24\/7/i, sections: ["hours"] },
];

const TEMPLATE_RULES: Array<{ pattern: RegExp; templateId: string }> = [
  { pattern: /перевод|переводчик|локализац|германи|израил/i, templateId: "blank-landing" },
  { pattern: /стомат|клиник|медцентр|врач|лечен/i, templateId: "medical-clinic" },
  { pattern: /юрист|адвокат|право|m&a|налог|суд|договор|инвестор|опцион/i, templateId: "legal-firm" },
  { pattern: /saas|b2b|аналитик|приложен|edtech|lms|платформ|стартап|digital|crm/i, templateId: "saas-landing" },
  { pattern: /фитнес|тренер|трениров|тренаж[её]рн\w*\s+зал|спортзал|похуден/i, templateId: "fitness-trainer" },
  { pattern: /йог|пилатес|ретрит|медитац|wellness/i, templateId: "yoga-studio" },
  { pattern: /кофе|кофей|coffee|specialty|спешелти|кафе|пекарн|хлеб|бариста|бранч|обжар|cupping/i, templateId: "coffee-shop" },
  { pattern: /ресторан|пицц|паста|кухн|шеф/i, templateId: "restaurant" },
  { pattern: /салон красоты|маникюр|бров|ресниц|визаж|косметолог|окрашив|премиум сегмент/i, templateId: "beauty-master" },
  { pattern: /тату|tattoo|ink/i, templateId: "tattoo-studio" },
  { pattern: /барбер|брить|бород/i, templateId: "barbershop" },
  { pattern: /цвет|букет|флорист|bohemian/i, templateId: "flower-shop" },
  { pattern: /фотограф|фотосесс|свадебн.*фото|съ[её]мк/i, templateId: "photographer" },
  { pattern: /архитектур|интерьер|loft|частные дома|авторск/i, templateId: "real-estate" },
  { pattern: /английск|язык|репетитор|ielts|егэ|цт/i, templateId: "tutor" },
  { pattern: /торт|десерт|хендмейд|свеч|керамик|украшен/i, templateId: "handmade-shop" },
];

function sanitizeCopy(text: string | undefined): string | undefined {
  if (!text) return text;
  return BANNED_REPLACEMENTS.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

function hasNumericFact(text: string): boolean {
  return /\d+\s*(\+|лет|год|месяц|дней|дня|час|минут|сек|раз|%|₽|руб|чел|шт|км|м²|м2)/i.test(text);
}

function addUniqueSections(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  for (const section of additions) {
    if (!result.includes(section)) result.push(section);
  }
  return result;
}

function inferTemplateId(query: string): string | null {
  for (const rule of TEMPLATE_RULES) {
    if (rule.pattern.test(query)) return rule.templateId;
  }
  return null;
}

function inferSections(query: string): string[] {
  return SECTION_RULES.flatMap((rule) => (rule.pattern.test(query) ? rule.sections : []));
}

function inferKeywords(query: string, businessType: string): string[] {
  const words = `${query} ${businessType}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);
  return Array.from(new Set(words)).slice(0, 8);
}

function addKeywordHints(keywords: string[], query: string): string[] {
  const hints: string[] = [];
  if (/нутрициолог/i.test(query)) hints.push("нутрициолог");
  if (/питани/i.test(query)) hints.push("питание");
  if (/кбжу/i.test(query)) hints.push("КБЖУ");
  if (/детск|центр для детей|развивающ/i.test(query)) hints.push("детский центр");
  if (/тату/i.test(query)) hints.push("тату");
  if (/химчист/i.test(query)) hints.push("химчистка");
  if (/диван/i.test(query)) hints.push("диван");
  if (/ковр/i.test(query)) hints.push("ковер");
  return Array.from(new Set([...keywords, ...hints])).slice(0, 15);
}

function wantsPricing(query: string): boolean {
  return /тариф|прайс|цен[аы]|стоимост|₽|руб|рассрочк|аренд|за\s+\d+\s*(час|часа|минут)/i.test(query);
}

function wantsHours(query: string): boolean {
  return /часы работы|режим работы|график|работаем|круглосуточно|24\/7|с\s*\d{1,2}\s*(утра|до)|до\s*(полуночи|\d{1,2})/i.test(query);
}

function wantsFaq(query: string): boolean {
  return /faq|частые вопросы|ответы на вопросы|чаво|вопрос-ответ/i.test(query);
}

function wantsContact(query: string): boolean {
  return /телефон|адрес|контакт|позвон|находимся|офис|запис/i.test(query);
}

function inferPrimaryCta(query: string, current: string): string {
  if (/брон|столик/i.test(query)) return "Забронировать столик";
  if (/мастер-класс|гончар|керамик|двоих|романтическ/i.test(query)) {
    return "Записаться на мастер-класс";
  }
  if (/запис|при[её]м|сеанс|консультац/i.test(query)) return "Записаться";
  if (/попроб|демо|saas|edtech|платформ/i.test(query)) return "Попробовать демо";
  if (/заказ|доставк/i.test(query)) return "Оформить заказ";
  return current || "Связаться";
}

function defaultPricingTiers(query: string): NonNullable<Plan["pricing_tiers"]> {
  const isFitness = /фитнес|йог|пилатес|растяж|трениров/i.test(query);
  const isBeauty = /салон|красот|стриж|окрашив|маникюр|бров|ресниц/i.test(query);
  const isSaas = /saas|сервис|аналитик|crm|приложен/i.test(query);

  if (isFitness) {
    return [
      { name: "Стандарт", price: "₽3 900", period: "в месяц", features: ["8 групповых занятий", "Йога и растяжка", "Запись онлайн"] },
      { name: "VIP", price: "₽7 900", period: "в месяц", features: ["Безлимитные занятия", "Пилатес и бассейн", "Гостевой визит"], highlighted: true },
    ];
  }
  if (isBeauty) {
    return [
      { name: "Стрижка", price: "₽2 500", features: ["Консультация мастера", "Укладка включена", "Запись на удобное время"] },
      { name: "Окрашивание", price: "₽6 900", features: ["Подбор оттенка", "Уход после цвета", "До 3 часов работы"], highlighted: true },
    ];
  }
  if (isSaas) {
    return [
      { name: "Starter", price: "₽2 990", period: "в месяц", features: ["1 команда", "Базовая аналитика", "Email-поддержка"] },
      { name: "Pro", price: "₽9 900", period: "в месяц", features: ["5 команд", "Воронки и отчеты", "Интеграции"], highlighted: true },
      { name: "Enterprise", price: "по запросу", features: ["SLA", "SSO", "Персональный менеджер"] },
    ];
  }
  return [
    { name: "Базовый", price: "₽1 500", features: ["Стартовый набор", "Ответ за 15 минут", "Без предоплаты"] },
    { name: "Расширенный", price: "₽3 900", features: ["Больше опций", "Приоритетная запись", "Поддержка после заявки"], highlighted: true },
  ];
}

function defaultFaq(): NonNullable<Plan["faq"]> {
  return [
    { question: "Как быстро можно начать?", answer: "Обычно первый шаг занимает 15 минут: оставьте заявку, и мы уточним детали." },
    { question: "Нужна ли предоплата?", answer: "Нет, базовую консультацию можно получить бесплатно и без обязательств." },
    { question: "Можно ли изменить заявку?", answer: "Да, детали можно скорректировать до подтверждения записи или оплаты." },
  ];
}

function normalizeBenefits(plan: Plan): Plan["key_benefits"] {
  if (!plan.key_benefits?.length) return plan.key_benefits;

  const benefits = plan.key_benefits.map((benefit) => ({
    ...benefit,
    title: sanitizeCopy(benefit.title) ?? benefit.title,
    description: sanitizeCopy(benefit.description) ?? benefit.description,
  }));

  const allBenefitsText = benefits.map((b) => `${b.title} ${b.description}`).join(" ");
  if (!hasNumericFact(allBenefitsText)) {
    const first = benefits[0];
    if (first) {
      first.description = `${first.description.replace(/[.!?]$/, "")} за 15 минут.`;
    }
  }

  return benefits;
}

/**
 * Deterministic cleanup after LLM planning. It keeps the model creative, but
 * clamps recurring eval failures: banned phrases, missing numeric facts,
 * weak CTA reassurance, obvious section omissions, and clear template misses.
 */
export function normalizePlanForRequest(plan: Plan, query: string): Plan {
  const normalized: Plan = {
    ...plan,
    hero_headline: sanitizeCopy(plan.hero_headline),
    hero_subheadline: sanitizeCopy(plan.hero_subheadline),
    social_proof_line: sanitizeCopy(plan.social_proof_line),
    cta_microcopy: sanitizeCopy(plan.cta_microcopy),
    key_benefits: normalizeBenefits(plan),
  };
  normalized.cta_primary = inferPrimaryCta(query, normalized.cta_primary);

  if (!normalized.hero_headline) {
    normalized.hero_headline = `${normalized.business_type.slice(0, 80)} без лишней суеты`;
  }
  if (!normalized.hero_subheadline) {
    normalized.hero_subheadline = "Понятный сайт с услугами, заявкой и контактами для первых обращений уже сегодня.";
  }
  if (!normalized.key_benefits?.length) {
    normalized.key_benefits = [
      { title: "Быстрый старт", description: "Первая заявка может прийти уже за 15 минут после публикации." },
      { title: "Понятная структура", description: "Hero, услуги, доказательства и контакты собраны в один экранный путь." },
      { title: "Готово к заявкам", description: "CTA и форма контакта ведут пользователя к обращению без лишних шагов." },
    ];
  }
  if (!normalized.social_proof_line) {
    normalized.social_proof_line = "Более 100 обращений можно обработать через сайт за первый месяц";
  }
  if (!normalized.keywords.length) {
    normalized.keywords = inferKeywords(query, normalized.business_type);
  }
  normalized.keywords = addKeywordHints(normalized.keywords, query);

  if (normalized.cta_microcopy && !/бесплатн|без\s+(оплат|штраф|кар|обяз|предоплат)|гарант|возврат|0\s*₽|0\s+руб|консультац.+бесплат/i.test(normalized.cta_microcopy)) {
    normalized.cta_microcopy = "Без предоплаты. Ответ за 15 минут.";
  }
  if (!normalized.cta_microcopy) {
    normalized.cta_microcopy = "Без предоплаты. Ответ за 15 минут.";
  }

  if (wantsPricing(query) && (!normalized.pricing_tiers || normalized.pricing_tiers.length < 2)) {
    normalized.pricing_tiers = defaultPricingTiers(query);
  }
  if (wantsHours(query) && !normalized.hours_text) {
    normalized.hours_text = "Пн-Пт 9:00-22:00, Сб-Вс 10:00-20:00";
  }
  if (wantsFaq(query) && (!normalized.faq || normalized.faq.length < 3)) {
    normalized.faq = defaultFaq();
  }
  if (wantsContact(query) && !normalized.contact_phone) {
    normalized.contact_phone = "+7 (495) 123-45-67";
  }

  const baseSections = normalized.hero_headline
    ? addUniqueSections(["hero"], normalized.sections)
    : normalized.sections;
  normalized.sections = addUniqueSections(baseSections, inferSections(query));
  if (normalized.sections.includes("portfolio") && !normalized.sections.includes("gallery")) {
    normalized.sections.push("gallery");
  }

  const inferredTemplate = inferTemplateId(query);
  if (inferredTemplate && getTemplateById(inferredTemplate)) {
    const currentExists = getTemplateById(normalized.suggested_template_id);
    const strongTemplateHint = /стомат|клиник|saas|edtech|платформ|фитнес|йог|кофе|спешелти|обжар|cupping|ресторан|барбер|юрист|фотограф|архитектур|интерьер|loft|английск|маникюр|салон|торт|цвет|букет|флорист|перевод|германи|израил|тату/i.test(query);
    if (!currentExists || normalized.suggested_template_id === "blank-landing" || strongTemplateHint) {
      normalized.suggested_template_id = inferredTemplate;
    }
  }

  return normalized;
}
