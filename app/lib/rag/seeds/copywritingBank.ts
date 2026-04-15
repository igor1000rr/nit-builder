/**
 * Вспомогательный банк копирайтинговых seed-фраз: hero headlines,
 * benefits sets, social proof lines, CTA microcopy. Индексируются как
 * отдельные категории в ragStore — для будущего использования в polish
 * (отдельная правка копирайта) и ручного поиска через admin-endpoint.
 *
 * В первом релизе few-shot для Planner тянется только из plan_example.
 * Этот bank — задел: когда накопится 100-200 штук, добавится
 * buildCopywritingHint() для Planner чтобы подмешивать чужие примеры
 * по нише.
 */

export type HeroSeed = { text: string; niche: string; tone: string; language: "ru" | "en" | "by" };
export type BenefitsSeed = {
  items: Array<{ title: string; description: string }>;
  niche: string;
  language: "ru" | "en" | "by";
};
export type SocialProofSeed = { text: string; niche: string; language: "ru" | "en" | "by" };
export type MicrocopySeed = { text: string; niche: string; purpose: string };

export const HERO_HEADLINE_SEEDS: HeroSeed[] = [
  { text: "Кофе варят те, кто им живёт", niche: "coffee-shop", tone: "тёплый", language: "ru" },
  { text: "Стрижка, которую замечают", niche: "barbershop", tone: "брутальный", language: "ru" },
  { text: "Стоматология, в которую не страшно идти с ребёнком", niche: "dental", tone: "спокойный", language: "ru" },
  { text: "Понятная аналитика продаж за 10 минут в день", niche: "saas", tone: "деловой", language: "ru" },
  { text: "Тело меняется там, где регулярно", niche: "fitness", tone: "мотивирующий", language: "ru" },
  { text: "Настоящая Италия в 30 минутах от дома", niche: "restaurant", tone: "гостеприимный", language: "ru" },
  { text: "Торты которые пахнут как у бабушки", niche: "handmade", tone: "семейный", language: "ru" },
  { text: "Юристы которые закрывают сделки, а не просто ведут переписку", niche: "legal", tone: "строгий", language: "ru" },
  { text: "Свадьба без постановочных поцелуев", niche: "photographer", tone: "искренний", language: "ru" },
  { text: "Разобраться там, где не разобраться одному", niche: "psychologist", tone: "бережный", language: "ru" },
  { text: "Уборка сделана, пока вы на работе", niche: "cleaning", tone: "практичный", language: "ru" },
  { text: "IELTS 7.0 за 4 месяца или разговорный за 6", niche: "tutor", tone: "структурный", language: "ru" },
  { text: "Автосервис, который не чинит то, что не сломано", niche: "auto-service", tone: "честный", language: "ru" },
  { text: "Татуировка, о которой не пожалеете через 10 лет", niche: "tattoo", tone: "серьёзный", language: "ru" },
  { text: "Букет, который сделан не из остатков", niche: "flowers", tone: "искренний", language: "ru" },
  { text: "Квартира под ключ без переделок за ваш счёт", niche: "construction", tone: "уверенный", language: "ru" },
  { text: "Ветклиника которая работает, когда остальные закрыты", niche: "vet", tone: "заботливый", language: "ru" },
  { text: "Маникюр который держится 3+ недели", niche: "nail-salon", tone: "дружелюбный", language: "ru" },
  { text: "Код ревью за 24 часа — пока свежа память", niche: "consulting", tone: "деловой", language: "ru" },
  { text: "Детский сад где ребёнок хочет оставаться", niche: "kindergarten", tone: "тёплый", language: "ru" },
];

export const BENEFITS_SEEDS: BenefitsSeed[] = [
  {
    niche: "coffee-shop",
    language: "ru",
    items: [
      { title: "Свежая обжарка", description: "Зерно уходит в помол максимум через 7 дней после обжарки." },
      { title: "Альтернатива эспрессо", description: "V60, кемекс, аэропресс — кофе как крафтовый продукт." },
      { title: "Завтраки до 13:00", description: "Гранола, авокадо-тосты, сырники — всё утром свежее." },
    ],
  },
  {
    niche: "barbershop",
    language: "ru",
    items: [
      { title: "Мастера 5+ лет", description: "Каждый сдал внутренний экзамен и ведёт свою клиентуру." },
      { title: "Запись за 2 минуты", description: "Выбирай мастера, время, услугу — без звонков." },
      { title: "Премиум-инструмент", description: "Машинки Wahl, бритвы Dovo, уход American Crew." },
    ],
  },
  {
    niche: "fitness",
    language: "ru",
    items: [
      { title: "Мини-группы до 12 человек", description: "Инструктор успевает исправить технику каждому." },
      { title: "Заморозка абонемента", description: "Уехали в отпуск — срок сдвигается без доплат." },
      { title: "Сертифицированные тренеры", description: "FPA, PMA, Yoga Alliance — документы на сайте." },
    ],
  },
  {
    niche: "construction",
    language: "ru",
    items: [
      { title: "Смета без плавающих позиций", description: "Фиксируем цену материалов в договоре на старте." },
      { title: "Свои бригады", description: "Не перекупщики задач, за качество отвечаем напрямую." },
      { title: "Гарантия 3 года", description: "На отделку и инженерку — письменно, с актом." },
      { title: "Дизайн-проект в подарок", description: "При заказе ремонта от 40 м² визуализация бесплатно." },
    ],
  },
  {
    niche: "dental",
    language: "ru",
    items: [
      { title: "Лечение во сне", description: "Седация закисью азота для самых тревожных пациентов." },
      { title: "Гарантия 3 года", description: "На пломбы и протезирование — письменно в договоре." },
      { title: "Рассрочка 0%", description: "На имплантацию и ортодонтию до 12 месяцев." },
    ],
  },
  {
    niche: "saas",
    language: "ru",
    items: [
      { title: "Подключение за 15 минут", description: "Готовые интеграции с amoCRM, Bitrix24, HubSpot." },
      { title: "Метрики которые важны", description: "LTV, CAC, churn — без настройки формул." },
      { title: "Telegram-алерты", description: "Уведомление когда конверсия падает больше чем на 15%." },
      { title: "Экспорт в Excel и Looker", description: "Данные не застрянут в чужом продукте." },
    ],
  },
];

export const SOCIAL_PROOF_SEEDS: SocialProofSeed[] = [
  { text: "Более 500 постоянных гостей и 4.9 на Google Maps", niche: "coffee-shop", language: "ru" },
  { text: "Более 1200 стрижек в месяц, 4.9 на Яндекс.Картах", niche: "barbershop", language: "ru" },
  { text: "Более 8000 пациентов с 2015 года, 4.8 на Продокторов", niche: "dental", language: "ru" },
  { text: "200+ компаний доверяют свою аналитику нам", niche: "saas", language: "ru" },
  { text: "350 постоянных клиенток, в студии с 2019 года", niche: "fitness", language: "ru" },
  { text: "5 лет в городе, 4.7 на TripAdvisor", niche: "restaurant", language: "ru" },
  { text: "Более 800 тортов для семей за 5 лет", niche: "handmade", language: "ru" },
  { text: "140+ клиентов из топ-500 российского бизнеса", niche: "legal", language: "ru" },
  { text: "170+ свадеб, публикации в Wedded Wonderland", niche: "photographer", language: "ru" },
  { text: "200+ клиентов, член Ассоциации КПТ с 2019", niche: "psychologist", language: "ru" },
  { text: "3500+ квартир убрали за 4 года работы", niche: "cleaning", language: "ru" },
  { text: "Более 200 учеников с 2016, 35+ сданных IELTS на 7.0+", niche: "tutor", language: "ru" },
  { text: "47 объектов сдали под ключ с 2020, ни одного суда", niche: "construction", language: "ru" },
  { text: "Лечим 3000 животных в год, 4.9 на Flamp", niche: "vet", language: "ru" },
  { text: "Обучили 600+ мастеров за 8 лет собственной школы", niche: "nail-salon", language: "ru" },
];

export const MICROCOPY_SEEDS: MicrocopySeed[] = [
  { text: "Без предоплаты, оплата после услуги", niche: "any", purpose: "remove-friction" },
  { text: "Ответ за 15 минут в рабочее время", niche: "any", purpose: "speed" },
  { text: "Первая консультация бесплатно", niche: "service", purpose: "lower-barrier" },
  { text: "Отмена без штрафа за 2 часа", niche: "booking", purpose: "safety" },
  { text: "Без карты и звонков менеджера", niche: "saas", purpose: "remove-friction" },
  { text: "Конфиденциальность гарантирована договором", niche: "psychologist", purpose: "trust" },
  { text: "Оплата после проверки работы", niche: "cleaning", purpose: "trust" },
  { text: "Согласуем эскиз за день, оплата после дегустации", niche: "handmade", purpose: "trust" },
  { text: "Первичный осмотр — 0 ₽", niche: "dental", purpose: "lower-barrier" },
  { text: "Пробное занятие — бесплатно, без обязательств", niche: "tutor", purpose: "lower-barrier" },
  { text: "Бронь даты — 20%, остальное после события", niche: "photographer", purpose: "trust" },
  { text: "Смета фиксируется в договоре, не плавает", niche: "construction", purpose: "trust" },
  { text: "Страховка имущества до 500 тыс. ₽", niche: "cleaning", purpose: "safety" },
  { text: "Приходите без резерва — всегда найдём место", niche: "restaurant", purpose: "lower-barrier" },
];
