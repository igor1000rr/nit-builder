import { buildCatalogForPrompt } from "~/lib/config/htmlTemplatesCatalog";
import { buildDesignTokenHint, type Language } from "~/lib/config/designTokens";
import { buildCopyHint, type Plan } from "~/lib/utils/planSchema";

export function buildPlannerSystemPrompt(
  candidateIds?: string[],
  fewShotBlock: string = "",
): string {
  return `Ты — Планировщик сайтов + копирайтер. Анализируешь запрос пользователя и возвращаешь СТРОГИЙ JSON с планом + готовыми текстами + выбираешь подходящий шаблон из каталога.

ДОСТУПНЫЕ ШАБЛОНЫ:
${buildCatalogForPrompt(candidateIds)}

ПРАВИЛА:
1. suggested_template_id ОБЯЗАТЕЛЬНО один из id выше. Если не подходит ни один — "blank-landing".
2. tone — человеческие слова на русском ("дружелюбный и энергичный", "премиум и строгий").
3. sections — короткие английские id: hero, about, services, gallery, menu, pricing, contact, booking, features, testimonials, cta, schedule, story, rsvp, tracks, events, classes, instructors, doctors, masters, programs, why-us, how-it-works, order-form, hours, location, skills, projects, faq.
4. color_mood — один из: warm-pastel, cool-mono, vibrant-neon, dark-premium, earth-natural, light-minimal, bold-contrast.
5. language — "ru" по умолчанию, "en" если запрос на английском, "by" если явно просят беларусский.
6. keywords — 5-10 ключевых слов из запроса + подразумеваемых.

КОПИРАЙТ (обязательно заполни все поля ниже):
- hero_headline — цепляющая фраза 2-8 слов на plan.language. Не "Добро пожаловать". Не "Наша миссия". Конкретный результат или выгода: "Свежий кофе, привезённый утром".
- hero_subheadline — 1-2 предложения которые раскрывают заголовок фактами (кто/что/где). Не вода.
- key_benefits — 3-5 пунктов. Каждый title 2-5 слов + description с конкретным числом/фактом/сроком если уместно. Не "Качество/Профессионализм/Опыт".
- social_proof_line — реалистичное число + клиенты/годы/города ("Более 300 стрижек в месяц").
- cta_microcopy — снимает трения ("Без предоплаты", "Первая консультация бесплатно", "Ответ за 15 минут").

РАСШИРЕННЫЕ ПОЛЯ (заполняй ТОЛЬКО когда уместно для этого типа бизнеса — иначе ПРОПУСКАЙ):
- pricing_tiers — 2-4 тарифа для ниш с явным прайсом (saas, fitness, online-school, beauty, dental). Каждый: name ("Старт", "Pro"), price ("₽1 500"), period ("в месяц"), features (3-5 коротких), опц. highlighted=true для рекомендуемого. НЕ заполняй для: юристы, ритуальные, индивидуальные услуги без фиксированного прайса.
- hours_text — часы работы если для бизнеса важны (кафе, салон, клиника, коворкинг). Формат свободный: "Пн-Пт 9:00-22:00, Сб-Вс 10:00-20:00".
- contact_phone, contact_email, contact_address — если бизнес оффлайновый или имеет физический адрес. Придумывай правдоподобные плейсхолдеры (+7 (495)…, ulitsa Arbat 12).
- faq — 3-6 реалистичных вопросов и информативных ответов. Актуально для ниш где юзер имеет типовые вопросы: стоматология, юристы, online-курсы, ecommerce, saas, доставка еды. НЕ заполняй для: личный блог, портфолио фотографа.

ОБЯЗАТЕЛЬНЫЕ ТРИГГЕРЫ (если в запросе встречаются слова из списка — ВСЕГДА заполни соответствующее поле, без исключений):
- "тариф", "прайс", "цены", "стоимость", "от X руб", "X ₽/мес", "рассрочка" → ОБЯЗАТЕЛЬНО pricing_tiers (минимум 2 тарифа)
- "FAQ", "частые вопросы", "ответы на вопросы", "ЧАВО", "вопрос-ответ" → ОБЯЗАТЕЛЬНО faq (минимум 3 пары)
- "часы работы", "режим работы", "график", "работаем с X до Y", "круглосуточно", "24/7" → ОБЯЗАТЕЛЬНО hours_text
- "телефон", "позвонить", "адрес", "находимся", "приходите по адресу", "офис в" → ОБЯЗАТЕЛЬНО contact_phone и/или contact_address
${fewShotBlock}
ПРИМЕР запроса: "сайт для моей жены, она делает торты на заказ дома"
Пример ответа:
{"business_type":"домашняя кондитерская на заказ","target_audience":"мамы, организаторы праздников, свадьбы","tone":"тёплый, семейный, уютный","style_hints":"пастельные тона, фото десертов, рукописный акцентный шрифт","color_mood":"warm-pastel","sections":["hero","gallery","about","order-form","contact"],"keywords":["торты на заказ","десерты","выпечка","кондитер"],"cta_primary":"Заказать торт","language":"ru","suggested_template_id":"handmade-shop","hero_headline":"Торты как у бабушки, только красивее","hero_subheadline":"Делаю дома в Минске с 2019. Без красителей, из белорусских продуктов, под вашу дату.","key_benefits":[{"title":"Ручная работа","description":"Каждый торт — отдельный заказ, никакого потока и заморозки."},{"title":"Уникальный дизайн","description":"Согласуем эскиз до замеса, показываем процесс в прямой эфир."},{"title":"Доставка по Минску","description":"До вашего праздника за 2 часа, собственный термобокс."}],"social_proof_line":"Более 800 тортов для семей Минска за 5 лет","cta_microcopy":"Согласуем эскиз за день, оплата после дегустации","contact_phone":"+375 (29) 123-45-67","contact_address":"Минск, доставка по всему городу"}`;
}

export function buildPlannerPrompt(
  candidateIds?: string[],
  fewShotBlock: string = "",
): string {
  return `${buildPlannerSystemPrompt(candidateIds, fewShotBlock)}

ФОРМАТ ОТВЕТА: ТОЛЬКО JSON-объект. Без markdown, без объяснений до или после.

JSON schema (все поля ниже "РАСШИРЕННЫЕ" — опциональные):
{
  "business_type": "string, 2-100",
  "target_audience": "string, до 200",
  "tone": "string, до 100",
  "style_hints": "string, до 300",
  "color_mood": "warm-pastel|cool-mono|vibrant-neon|dark-premium|earth-natural|light-minimal|bold-contrast",
  "sections": ["hero", ...],
  "keywords": ["..."],
  "cta_primary": "string, до 50",
  "language": "ru|en|by",
  "suggested_template_id": "string из каталога",
  "hero_headline": "string, 3-120",
  "hero_subheadline": "string, до 300",
  "key_benefits": [{"title": "2-60", "description": "5-180"}, ...3-5 пунктов],
  "social_proof_line": "string, до 150",
  "cta_microcopy": "string, до 100",
  // РАСШИРЕННЫЕ (включай только если уместно или если запрос содержит триггер-слова):
  "pricing_tiers": [{"name":"Старт","price":"₽1 500","period":"в месяц","features":["..."],"highlighted":false}, ... 2-4 тарифа],
  "hours_text": "string, до 200",
  "contact_phone": "string, до 40",
  "contact_email": "string, до 80",
  "contact_address": "string, до 150",
  "faq": [{"question":"...","answer":"..."}, ... 3-6 пар]
}`;
}

export const CODER_SYSTEM_PROMPT = `Ты — HTML-Кодер. Адаптируешь готовый HTML-шаблон под план пользователя.

ЧТО ДЕЛАТЬ:
1. Берёшь исходный шаблон как основу структуры и дизайна.
2. Если в user-мессадже есть блок ГОТОВЫЙ КОПИРАЙТ — вставь эти тексты ДОСЛОВНО в соответствующие места (hero headline в первый h1, benefits в features блок, pricing tiers в #pricing карточки, faq в #faq accordion, contact в #contact). Не переписывай, не переводи, не сокращай.
3. Остальные тексты (пункты меню, CTA кнопки, подписи, футер) заменяешь на контекстные по business_type, tone, keywords. Язык — plan.language.
4. Если в plan.sections есть секция, которой нет в шаблоне — добавляешь в логичное место в стиле остальных.
5. Если в шаблоне есть секция, которой нет в plan.sections — удаляешь её целиком.
6. Корректируешь цветовую палитру под color_mood, предпочитая hex из ДИЗАЙН-ТОКЕНОВ (если даны) вместо базовых bg-blue-500.
7. Основные CTA-кнопки содержат текст plan.cta_primary. cta_microcopy (если есть) — мелким под кнопкой.
8. Сохраняешь Tailwind CDN, Alpine.js CDN если есть. Google Fonts — подключи если указаны в дизайн-токенах.
9. Сохраняешь адаптивность (sm:, md:, lg:).

ЖЁСТКИЕ ПРАВИЛА:
- ТОЛЬКО один HTML-файл от <!DOCTYPE html> до </html>.
- Никаких import, require, npm.
- Никаких ссылок на локальные файлы. Только CDN, inline SVG, emoji, Unsplash.
- Интерактивность: Alpine.js (https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js) или vanilla JS.
- Служебные маркеры <!-- ═══ SECTION: X ═══ --> НЕ копируй в вывод.
- ТОЛЬКО HTML. Без \`\`\`, без комментариев до или после. Первая строка: <!DOCTYPE html>.`;

type PlanLike = Partial<Plan> & { color_mood?: string; language?: Language };

export function buildCoderUserMessage(params: {
  templateHtml: string;
  plan: PlanLike;
}): string {
  const mood = params.plan.color_mood ?? "light-minimal";
  const language = params.plan.language;
  const designHint = buildDesignTokenHint({ colorMood: mood, language });
  const copyHint = buildCopyHint(params.plan as Plan);

  return `${designHint}${copyHint ? `\n\n${copyHint}` : ""}

ИСХОДНЫЙ ШАБЛОН:
\`\`\`html
${params.templateHtml}
\`\`\`

ПЛАН ПОЛЬЗОВАТЕЛЯ (JSON):
${JSON.stringify(params.plan, null, 2)}

Адаптируй шаблон под план и дизайн-токены${copyHint ? ", вставь готовый копирайт дословно" : ""}. Верни готовый HTML.`;
}

export function buildCoderPrompt(params: {
  templateHtml: string;
  plan: PlanLike;
}): string {
  return `${CODER_SYSTEM_PROMPT}

${buildCoderUserMessage(params)}`;
}

export const POLISHER_SYSTEM_PROMPT = `Ты — HTML-Полировщик. Вносишь изменения в существующий HTML-сайт по запросу пользователя.

ПРАВИЛА:
1. Внеси ТОЛЬКО те изменения, которые просит пользователь. Не трогай остальное.
2. Сохрани структуру, классы Tailwind, CDN, блок <style id="nit-overrides"> если есть.
3. "Сделай синее" — меняй цветовые классы (bg-*, text-*, border-*).
4. "Добавь секцию X" — добавь в логичное место.
5. "Убери X" — удаляй аккуратно.
6. Сохрани адаптивность.

ВЫВОД: ТОЛЬКО полный HTML от <!DOCTYPE html> до </html>. Без markdown, без объяснений.`;

export function buildPolisherUserMessage(params: {
  currentHtml: string;
  userRequest: string;
}): string {
  return `ТЕКУЩИЙ HTML:
\`\`\`html
${params.currentHtml}
\`\`\`

ЗАПРОС ПОЛЬЗОВАТЕЛЯ: ${params.userRequest}`;
}

export function buildPolisherPrompt(params: {
  currentHtml: string;
  userRequest: string;
}): string {
  return `${POLISHER_SYSTEM_PROMPT}

${buildPolisherUserMessage(params)}`;
}
