/**
 * 12 seed-примеров (запрос → полный Plan) для few-shot Planner-а.
 *
 * Покрывают основные ниши freelance-заказчиков: услуги оффлайн (кофейня,
 * барбершоп, стоматолог), творческие (торты, фотограф), digital (SaaS),
 * образование (репетитор), частные практики (психолог), сервис (клининг).
 *
 * Копирайт написан руками под требования commit F: конкретные числа, без
 * шаблонных фраз "Добро пожаловать"/"Наша миссия", benefits не про
 * "качество/опыт/профессионализм".
 *
 * Все Plan соответствуют PlanSchema (backward-compat fields помечены).
 * suggested_template_id использует известные шаблоны из каталога или
 * blank-landing как безопасный fallback.
 */

import type { Plan } from "~/lib/utils/planSchema";

export type PlanExampleSeed = {
  id: string;
  niche: string;
  query: string;
  plan: Plan;
};

export const PLAN_EXAMPLE_SEEDS: PlanExampleSeed[] = [
  {
    id: "coffee-shop-casual",
    niche: "coffee-shop",
    query: "открываю небольшую кофейню в центре города, нужен стильный сайт с меню и фотками",
    plan: {
      business_type: "specialty-кофейня в центре",
      target_audience: "офисные работники, молодёжь, поклонники альтернативной обжарки",
      tone: "тёплый, уютный, со вкусом",
      style_hints: "крупные фото напитков, приглушённая палитра, рукописный акцент",
      color_mood: "warm-pastel",
      sections: ["hero", "menu", "about", "gallery", "location", "hours"],
      keywords: ["кофе", "эспрессо", "обжарка", "бариста", "завтрак"],
      cta_primary: "Смотреть меню",
      language: "ru",
      suggested_template_id: "coffee-shop",
      hero_headline: "Кофе варят те, кто им живёт",
      hero_subheadline:
        "Обжариваем зерно из Колумбии и Эфиопии каждую пятницу. Каждая чашка — ручная работа бариста, а не кнопка автомата.",
      key_benefits: [
        { title: "Свежая обжарка", description: "Зерно уходит в помол максимум через 7 дней после обжарки." },
        { title: "Бариста-перфекционист", description: "Каждый проходит 3 месяца стажировки перед первой сменой." },
        { title: "Альтернатива эспрессо", description: "V60, кемекс, аэропресс — кофе как крафтовый продукт." },
        { title: "Завтраки до 13:00", description: "Гранола, авокадо-тосты, сырники — всё утром свежее." },
      ],
      social_proof_line: "Более 500 постоянных гостей и 4.9 на Google Maps",
      cta_microcopy: "Приходите без резерва — всегда найдём место",
    },
  },
  {
    id: "barbershop-premium",
    niche: "barbershop",
    query: "барбершоп для мужиков, брутальный стиль, стрижки и бритьё",
    plan: {
      business_type: "мужской барбершоп",
      target_audience: "мужчины 25-45, ценящие классическую эстетику и время",
      tone: "брутальный, уверенный, с характером",
      style_hints: "тёмные тона, кожа, латунь, чёрно-белые фото мастеров",
      color_mood: "dark-premium",
      sections: ["hero", "services", "masters", "gallery", "booking", "contact"],
      keywords: ["барбершоп", "стрижка", "бритьё", "борода", "опасная бритва"],
      cta_primary: "Записаться",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Стрижка, которую замечают",
      hero_subheadline:
        "7 мастеров, 15 лет практики на команду. Опасная бритва, горячее полотенце, виски на финале.",
      key_benefits: [
        { title: "Мастера с опытом 5+ лет", description: "Каждый сдал внутренний экзамен и ведёт свою клиентуру." },
        { title: "Запись за 2 минуты", description: "Выбирай мастера, время, услугу — без звонков." },
        { title: "Премиум-инструмент", description: "Машинки Wahl, бритвы Dovo, уход American Crew." },
      ],
      social_proof_line: "Более 1200 стрижек в месяц, 4.9 на Яндекс.Картах",
      cta_microcopy: "Отмена без штрафа за 2 часа",
    },
  },
  {
    id: "dental-family",
    niche: "dental",
    query: "семейная стоматология, детская и взрослая, хочу чтобы сайт вызывал доверие",
    plan: {
      business_type: "семейная стоматологическая клиника",
      target_audience: "семьи с детьми, взрослые пациенты района",
      tone: "спокойный, профессиональный, тёплый",
      style_hints: "много воздуха, мягкие синие и белые тона, фото врачей и интерьера",
      color_mood: "cool-mono",
      sections: ["hero", "services", "doctors", "why-us", "booking", "contact", "hours"],
      keywords: ["стоматология", "детский стоматолог", "лечение", "имплантация", "чистка"],
      cta_primary: "Записаться на приём",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Стоматология, в которую не страшно идти с ребёнком",
      hero_subheadline:
        "Лечим взрослых и детей с 3 лет в одной клинике. Без очередей, без криков, без боли — современная анестезия и закись азота.",
      key_benefits: [
        { title: "Детский врач с 12-летним стажем", description: "Работает только с детьми, знает как договориться с каждым." },
        { title: "Лечение во сне", description: "Седация закисью азота для самых тревожных пациентов." },
        { title: "Гарантия 3 года", description: "На пломбы и протезирование — письменно в договоре." },
        { title: "Рассрочка 0%", description: "На имплантацию и ортодонтию до 12 месяцев без переплат." },
      ],
      social_proof_line: "Более 8000 пациентов с 2015 года, 4.8 на Продокторов",
      cta_microcopy: "Первичный осмотр — 0 ₽",
    },
  },
  {
    id: "saas-b2b-analytics",
    niche: "saas",
    query: "лендинг для SaaS по аналитике продаж для малого бизнеса",
    plan: {
      business_type: "B2B SaaS аналитики продаж",
      target_audience: "CEO и коммерческие директора малого бизнеса (10-100 чел)",
      tone: "деловой, ясный, уверенный без корпоративной воды",
      style_hints: "минимализм, скриншоты продукта, график-первый экран, монохром",
      color_mood: "cool-mono",
      sections: ["hero", "features", "how-it-works", "pricing", "testimonials", "cta"],
      keywords: ["аналитика", "продажи", "CRM", "dashboard", "B2B"],
      cta_primary: "Попробовать 14 дней",
      language: "ru",
      suggested_template_id: "saas-landing",
      hero_headline: "Понятная аналитика продаж за 10 минут в день",
      hero_subheadline:
        "Подключаем вашу CRM, собираем воронку, считаем LTV и churn. Смотрите где теряете деньги — без аналитика в штате.",
      key_benefits: [
        { title: "Подключение за 15 минут", description: "Готовые интеграции с amoCRM, Bitrix24, HubSpot, Pipedrive." },
        { title: "Метрики которые важны", description: "LTV, CAC, churn, конверсия воронки — без настройки формул." },
        { title: "Оповещения о просадках", description: "Telegram-алерт когда конверсия падает больше чем на 15%." },
        { title: "Экспорт в Excel и Looker", description: "Ни одной строчки данных не застрянет в чужом продукте." },
      ],
      social_proof_line: "200+ компаний доверяют свою аналитику нам",
      cta_microcopy: "Без карты, без звонков менеджера",
    },
  },
  {
    id: "fitness-studio-small",
    niche: "fitness",
    query: "фитнес-студия с групповыми занятиями, йога, пилатес, растяжка",
    plan: {
      business_type: "бутиковая фитнес-студия групповых программ",
      target_audience: "женщины 25-45, новички и средний уровень",
      tone: "мотивирующий, поддерживающий, без агрессии",
      style_hints: "природные оттенки, зелень, фото занятий, мягкий свет",
      color_mood: "earth-natural",
      sections: ["hero", "programs", "schedule", "instructors", "pricing", "booking", "contact"],
      keywords: ["йога", "пилатес", "растяжка", "групповые занятия", "тренер"],
      cta_primary: "Первое занятие",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Тело меняется там, где регулярно",
      hero_subheadline:
        "14 направлений, 45 занятий в неделю, максимум 12 человек в зале. Первое пробное — бесплатно, без обязательств.",
      key_benefits: [
        { title: "Мини-группы до 12 человек", description: "Инструктор успевает исправить технику каждому." },
        { title: "Абонемент по заморозке", description: "Уехали в отпуск — срок сдвигается без доплат." },
        { title: "Сертифицированные тренеры", description: "FPA, PMA, Yoga Alliance — документы на сайте." },
      ],
      social_proof_line: "350 постоянных клиенток, в студии с 2019 года",
      cta_microcopy: "Пробный — 0 ₽, записаться за минуту",
    },
  },
  {
    id: "restaurant-italian",
    niche: "restaurant",
    query: "итальянский ресторан аутентичной кухни, паста и пицца на дровах",
    plan: {
      business_type: "итальянский ресторан традиционной кухни",
      target_audience: "семьи, пары, ценители кухни",
      tone: "гостеприимный, с характером, итальянский",
      style_hints: "тёплые оттенки, фото блюд и печи, акцент на сырьё",
      color_mood: "warm-pastel",
      sections: ["hero", "about", "menu", "gallery", "booking", "location"],
      keywords: ["итальянский ресторан", "паста", "пицца", "неаполитанская", "дровяная печь"],
      cta_primary: "Забронировать стол",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Настоящая Италия в 30 минутах от дома",
      hero_subheadline:
        "Паста руками, тесто 72 часа, печь 450°C. Повар Лоренцо учился в Неаполе, сыр моцарелла — из Кампании.",
      key_benefits: [
        { title: "Неаполитанская печь", description: "Пицца готовится 90 секунд при 450°C, как положено." },
        { title: "Паста фреш", description: "Раскатываем утром каждого дня, не замораживаем." },
        { title: "Сомелье в зале", description: "Поможем подобрать вино под блюдо и бюджет." },
      ],
      social_proof_line: "5 лет в городе, 4.7 на TripAdvisor",
      cta_microcopy: "Бронь бесплатная, подтверждение в SMS",
    },
  },
  {
    id: "handmade-cakes",
    niche: "handmade",
    query: "домашняя кондитерская, торты на заказ под день рождения и свадьбу",
    plan: {
      business_type: "домашняя кондитерская на заказ",
      target_audience: "мамы, организаторы праздников, молодожёны",
      tone: "тёплый, семейный, уютный",
      style_hints: "пастель, фото десертов крупным планом, рукописный акцент",
      color_mood: "warm-pastel",
      sections: ["hero", "gallery", "about", "order-form", "contact"],
      keywords: ["торты на заказ", "десерты", "свадебный торт", "кондитер"],
      cta_primary: "Заказать торт",
      language: "ru",
      suggested_template_id: "handmade-shop",
      hero_headline: "Торты которые пахнут как у бабушки",
      hero_subheadline:
        "Делаю дома с 2019 года, без красителей и консервантов. Согласуем эскиз за день, печём под вашу дату.",
      key_benefits: [
        { title: "Ручная работа", description: "Каждый торт — отдельный заказ, никакого потока." },
        { title: "Уникальный эскиз", description: "Рисуем под ваш повод, показываем процесс в прямой эфир." },
        { title: "Доставка по городу", description: "За 2 часа до праздника, собственный термобокс." },
      ],
      social_proof_line: "Более 800 тортов для семей за 5 лет",
      cta_microcopy: "Оплата после дегустации куска",
    },
  },
  {
    id: "legal-corporate",
    niche: "legal",
    query: "сайт для юридической фирмы, корпоративное право, M&A, налоги",
    plan: {
      business_type: "корпоративная юридическая фирма",
      target_audience: "владельцы и финдиры компаний 50-500 человек",
      tone: "строгий, уверенный, без пафоса",
      style_hints: "монохром, большая типографика, минимум графики, фото партнёров",
      color_mood: "dark-premium",
      sections: ["hero", "services", "team", "why-us", "contact"],
      keywords: ["юридические услуги", "корпоративное право", "M&A", "налоги", "сопровождение"],
      cta_primary: "Обсудить задачу",
      language: "ru",
      suggested_template_id: "legal-firm",
      hero_headline: "Юристы которые закрывают сделки, а не просто ведут переписку",
      hero_subheadline:
        "Сопровождаем M&A, структурируем холдинги, защищаем в налоговых спорах. 17 лет практики, 4 партнёра, команда 22 юриста.",
      key_benefits: [
        { title: "Партнёр на каждом проекте", description: "Не делегируем стажёрам ключевые этапы." },
        { title: "Закрытые сделки на 3+ млрд", description: "M&A, реструктуризации, инвестиционные раунды." },
        { title: "Фиксированная цена", description: "Оцениваем проект целиком, не считаем часы по таймеру." },
      ],
      social_proof_line: "140+ клиентов из топ-500 российского бизнеса",
      cta_microcopy: "Первая встреча — бесплатно, 30 минут",
    },
  },
  {
    id: "photographer-wedding",
    niche: "photographer",
    query: "свадебный фотограф, нужно портфолио и форма заявки",
    plan: {
      business_type: "свадебный фотограф",
      target_audience: "молодожёны, планирующие свадьбу за 6-12 месяцев",
      tone: "тёплый, искренний, без пафоса",
      style_hints: "крупные фото, минимум текста, светлая палитра, плёночная эстетика",
      color_mood: "light-minimal",
      sections: ["hero", "gallery", "about", "pricing", "booking"],
      keywords: ["свадебный фотограф", "фотосессия", "love story", "репортаж"],
      cta_primary: "Забронировать дату",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Свадьба без постановочных поцелуев",
      hero_subheadline:
        "Снимаю честный репортаж: смех свидетелей, слёзы мамы, первый танец как был. 8 лет, 170+ свадеб, собственный стиль.",
      key_benefits: [
        { title: "Стиль — репортаж", description: "Без «посмотри на меня», ловлю эмоции в моменте." },
        { title: "Плёнка + цифра", description: "Смешиваю форматы для глубины цвета и текстуры." },
        { title: "Готовые фото за 3 недели", description: "Подборка из 300-400 кадров в облаке." },
      ],
      social_proof_line: "170+ свадеб, публикации в Wedded Wonderland",
      cta_microcopy: "Бронь даты — 20%, остальное после свадьбы",
    },
  },
  {
    id: "psychologist-private",
    niche: "psychologist",
    query: "частный психолог, работаю онлайн и очно, нужен спокойный сайт",
    plan: {
      business_type: "частный психолог, КПТ",
      target_audience: "взрослые с тревогой, выгоранием, проблемами в отношениях",
      tone: "спокойный, бережный, без клинического тона",
      style_hints: "много воздуха, пастель, крупные заголовки, фото автора",
      color_mood: "earth-natural",
      sections: ["hero", "about", "how-it-works", "pricing", "booking", "contact"],
      keywords: ["психолог", "КПТ", "тревога", "выгорание", "терапия"],
      cta_primary: "Записаться на сессию",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Разобраться там, где не разобраться одному",
      hero_subheadline:
        "КПТ-психолог, 7 лет практики. Работаю с тревогой, выгоранием, отношениями. Онлайн по Zoom или очно в центре города.",
      key_benefits: [
        { title: "Метод с доказанной эффективностью", description: "Когнитивно-поведенческая терапия, протокол 8-20 сессий." },
        { title: "Без моральных оценок", description: "Не ставлю диагнозов, не читаю нотаций." },
        { title: "Первая сессия на 50%", description: "Чтобы вы поняли подходит ли вам мой подход." },
      ],
      social_proof_line: "200+ клиентов, член Ассоциации КПТ с 2019",
      cta_microcopy: "Конфиденциальность гарантирована договором",
    },
  },
  {
    id: "cleaning-service",
    niche: "cleaning",
    query: "клининговая компания, уборка квартир и офисов в городе",
    plan: {
      business_type: "клининговая компания",
      target_audience: "занятые семьи, офисы, квартиры после ремонта",
      tone: "уверенный, практичный, без преувеличений",
      style_hints: "чистая палитра, фото бригад и техники, короткие блоки",
      color_mood: "light-minimal",
      sections: ["hero", "services", "pricing", "why-us", "booking", "contact"],
      keywords: ["клининг", "уборка квартир", "уборка после ремонта", "химчистка дивана"],
      cta_primary: "Рассчитать стоимость",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "Уборка сделана, пока вы на работе",
      hero_subheadline:
        "Бригада приезжает в удобное время, работает в среднем 3-4 часа. Все сотрудники с трудовым договором и страховкой на имущество.",
      key_benefits: [
        { title: "Бригада с инструментом", description: "Привозим всё: от парового утюга до Karcher." },
        { title: "Страховка до 500 тыс. ₽", description: "Что-то разбили — возмещаем по акту, не спорим." },
        { title: "Официальный договор", description: "Физ. и юр. лицам, с закрывающими документами." },
      ],
      social_proof_line: "3500+ квартир убрали за 4 года работы",
      cta_microcopy: "Оплата после проверки уборки",
    },
  },
  {
    id: "tutor-english",
    niche: "tutor",
    query: "репетитор английского, подготовка к IELTS и разговорный, онлайн",
    plan: {
      business_type: "репетитор английского, онлайн",
      target_audience: "взрослые учащиеся: IELTS, переезд, работа в зарубежной компании",
      tone: "дружелюбный, структурный, без академизма",
      style_hints: "чистая палитра, живое фото преподавателя, отзывы в видео",
      color_mood: "cool-mono",
      sections: ["hero", "about", "programs", "how-it-works", "pricing", "testimonials", "booking"],
      keywords: ["английский", "IELTS", "репетитор", "разговорный английский", "онлайн"],
      cta_primary: "Записаться на пробный",
      language: "ru",
      suggested_template_id: "blank-landing",
      hero_headline: "IELTS 7.0 за 4 месяца или разговорный за 6",
      hero_subheadline:
        "C2 Proficient, 9 лет преподаю взрослым. 80% студентов сдают IELTS на запланированный балл с первого раза.",
      key_benefits: [
        { title: "План под вашу цель", description: "Визирная IELTS, переезд, работа — разные программы." },
        { title: "Домашка с фидбэком", description: "Письменные работы проверяю до следующего занятия, с пояснениями." },
        { title: "Пробное занятие", description: "30 минут, разберём уровень по CEFR и составим план." },
      ],
      social_proof_line: "Более 200 учеников с 2016, 35+ сданных IELTS на 7.0+",
      cta_microcopy: "Пробное — бесплатно, без обязательств",
    },
  },
];
