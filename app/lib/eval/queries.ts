/**
 * 30 hand-crafted eval queries покрывающих 24 ниши seed корпуса.
 *
 * Распределение:
 *   - 12 запросов "легкие" — короткие и прямые, должны иметь высокий
 *     similarity с одним из seed planExamples (k=1)
 *   - 12 запросов "средние" — переформулированные, между нишами
 *   - 6 запросов "сложные" — гибридные / неявные (тест на graceful k=0)
 *
 * Не лепим expectedTemplateId везде — Planner имеет свободу выбора, важна
 * семантика плана, а не точное совпадение шаблона.
 */

import type { EvalQuery } from "./types";

export const EVAL_QUERIES: EvalQuery[] = [
  // === Лёгкие (прямое попадание в seed) ===
  {
    id: "easy-coffee",
    query: "открываю небольшую кофейню в центре города, нужен сайт с меню и фотками",
    expectedNiche: "coffee-shop",
    mustHaveSections: ["hero", "menu"],
    expectedKeywordsAny: ["кофе", "эспрессо", "бариста"],
  },
  {
    id: "easy-barber",
    query: "барбершоп для мужиков, брутально, стрижки и бритьё",
    expectedNiche: "barbershop",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["барбершоп", "стрижка", "бритьё", "борода"],
  },
  {
    id: "easy-dental",
    query: "семейная стоматология, детская и взрослая, важно вызывать доверие",
    expectedNiche: "dental",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["стоматология", "лечение"],
  },
  {
    id: "easy-saas",
    query: "лендинг для SaaS аналитики продаж для малого бизнеса",
    expectedNiche: "saas",
    mustHaveSections: ["hero", "features"],
    expectedKeywordsAny: ["аналитика", "продажи", "SaaS", "B2B"],
  },
  {
    id: "easy-fitness",
    query: "фитнес-студия с групповыми занятиями, йога пилатес растяжка",
    expectedNiche: "fitness",
    mustHaveSections: ["hero", "programs"],
    expectedKeywordsAny: ["йога", "пилатес", "тренер"],
  },
  {
    id: "easy-restaurant",
    query: "итальянский ресторан с аутентичной кухней, паста и пицца на дровах",
    expectedNiche: "restaurant",
    mustHaveSections: ["hero", "menu"],
    expectedKeywordsAny: ["паста", "пицца", "итальянский"],
  },
  {
    id: "easy-cakes",
    query: "торты на заказ домашняя кондитерская под день рождения и свадьбу",
    expectedNiche: "handmade",
    mustHaveSections: ["hero", "gallery"],
    expectedKeywordsAny: ["торты", "десерты", "кондитер"],
  },
  {
    id: "easy-legal",
    query: "сайт для юридической фирмы корпоративное право M&A налоги",
    expectedNiche: "legal",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["юридические", "корпоративное"],
  },
  {
    id: "easy-photographer",
    query: "свадебный фотограф нужно портфолио и форма заявки",
    expectedNiche: "photographer",
    mustHaveSections: ["hero", "gallery"],
    expectedKeywordsAny: ["свадебный", "фотограф"],
  },
  {
    id: "easy-psychologist",
    query: "частный психолог работаю онлайн и очно нужен спокойный сайт",
    expectedNiche: "psychologist",
    mustHaveSections: ["hero", "about"],
    expectedKeywordsAny: ["психолог", "терапия"],
  },
  {
    id: "easy-cleaning",
    query: "клининговая компания уборка квартир и офисов в городе",
    expectedNiche: "cleaning",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["клининг", "уборка"],
  },
  {
    id: "easy-tutor",
    query: "репетитор английского подготовка к IELTS и разговорный онлайн",
    expectedNiche: "tutor",
    mustHaveSections: ["hero", "programs"],
    expectedKeywordsAny: ["английский", "репетитор"],
  },

  // === Средние (переформулировки, новые ниши из v2) ===
  {
    id: "med-ecom",
    query: "интернет-магазин женской одежды, casual стиль, доставка по городу",
    expectedNiche: "ecommerce",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["одежда", "магазин", "доставка"],
  },
  {
    id: "med-beauty",
    query: "салон красоты широкого профиля маникюр стрижка макияж в центре",
    expectedNiche: "beauty",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["салон", "красоты", "маникюр"],
  },
  {
    id: "med-realestate",
    query: "частный риэлтор сопровождение сделок купли продажи квартир",
    expectedNiche: "real-estate",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["риэлтор", "квартир", "недвижимость"],
  },
  {
    id: "med-online-school",
    query: "онлайн-школа программирования с нуля до junior за 6 месяцев",
    expectedNiche: "online-school",
    mustHaveSections: ["hero", "programs"],
    expectedKeywordsAny: ["программирование", "онлайн"],
  },
  {
    id: "med-driving",
    query: "автошкола обучение категория B современные машины и инструкторы",
    expectedNiche: "auto-school",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["автошкола", "вождение"],
  },
  {
    id: "med-food-delivery",
    query: "доставка здоровой еды с подсчётом КБЖУ на неделю",
    expectedNiche: "food-delivery",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["доставка", "еды", "кбжу", "здоровая"],
  },
  {
    id: "med-kids",
    query: "детский центр развития от 2 до 7 лет робототехника и творчество",
    expectedNiche: "kids-center",
    mustHaveSections: ["hero", "programs"],
    expectedKeywordsAny: ["детский", "развитие"],
  },
  {
    id: "med-event",
    query: "ведущий корпоративов и свадеб с опытом и шоу программой",
    expectedNiche: "event-host",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["ведущий", "мероприят"],
  },
  {
    id: "med-nutrition",
    query: "нутрициолог онлайн консультации и индивидуальные планы питания",
    expectedNiche: "nutritionist",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["нутрициолог", "питание"],
  },
  {
    id: "med-tattoo",
    query: "тату салон авторские эскизы realism и blackwork стерильно безопасно",
    expectedNiche: "tattoo",
    mustHaveSections: ["hero", "gallery"],
    expectedKeywordsAny: ["тату", "эскиз"],
  },
  {
    id: "med-car-service",
    query: "автосервис европейских авто BMW Audi ремонт и диагностика",
    expectedNiche: "car-service",
    mustHaveSections: ["hero", "services"],
    expectedKeywordsAny: ["автосервис", "ремонт"],
  },
  {
    id: "med-flowers",
    query: "цветочный магазин с доставкой букетов по городу за час",
    expectedNiche: "flowers",
    mustHaveSections: ["hero"],
    expectedKeywordsAny: ["цвет", "букет", "доставка"],
  },

  // === Сложные (тест graceful degradation, гибриды) ===
  {
    id: "hard-vague",
    query: "хочу красивый сайт для своего дела чтобы было современно",
    expectedNiche: "unknown",
  },
  {
    id: "hard-niche-mix",
    query: "услуги массажа на дому только женский мастер с медобразованием",
    expectedNiche: "unknown",
    expectedKeywordsAny: ["массаж"],
  },
  {
    id: "hard-rare-niche",
    query: "организую туры на охоту и рыбалку в Карелии для компании 4-8 человек",
    expectedNiche: "unknown",
    expectedKeywordsAny: ["охот", "рыбалк", "тур"],
  },
  {
    id: "hard-tech-product",
    query: "продаю собственный mqtt-брокер для умного дома open-source с pro-версией",
    expectedNiche: "saas",
    expectedKeywordsAny: ["mqtt", "open-source", "умный дом"],
  },
  {
    id: "hard-bilingual",
    query: "need a landing page for my Berlin-based wedding planner agency",
    expectedNiche: "event-host",
  },
  {
    id: "hard-edge-tone",
    query: "премиальный спа отель в горах для пар на выходные",
    expectedNiche: "unknown",
    mustHaveSections: ["hero", "gallery"],
  },
];
