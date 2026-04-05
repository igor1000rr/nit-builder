export type TemplateMeta = {
  id: string;
  name: string;
  category: "food" | "beauty" | "creative" | "service" | "event" | "business" | "personal" | "generic";
  description: string;
  bestFor: string[];
  sections: string[];
  style: string;
  colorMood: string;
  emoji: string;
};

export const TEMPLATE_CATALOG: TemplateMeta[] = [
  {
    id: "coffee-shop",
    name: "Кофейня / Кафе",
    category: "food",
    description: "Уютный лендинг для кофейни, кафе, пекарни, бистро. Меню, часы работы, адрес.",
    bestFor: ["кофейня", "кафе", "пекарня", "бариста", "бранч", "завтраки", "десерты"],
    sections: ["hero", "menu", "hours", "location", "contact"],
    style: "warm-minimalist",
    colorMood: "warm-pastel",
    emoji: "☕",
  },
  {
    id: "barbershop",
    name: "Барбершоп",
    category: "beauty",
    description: "Брутальный лендинг для барбершопа, мужской парикмахерской. Услуги, мастера, запись.",
    bestFor: ["барбершоп", "стрижка", "борода", "мастер", "парикмахер"],
    sections: ["hero", "services", "masters", "gallery", "booking", "contact"],
    style: "bold-dark",
    colorMood: "dark-premium",
    emoji: "💈",
  },
  {
    id: "photographer",
    name: "Фотограф",
    category: "creative",
    description: "Портфолио фотографа. Галерея работ, услуги, контакты. Свадьбы, семья, студия, репортаж.",
    bestFor: ["фотограф", "фотосессия", "свадьба", "портфолио", "съёмка"],
    sections: ["hero", "gallery", "services", "about", "contact"],
    style: "editorial",
    colorMood: "light-minimal",
    emoji: "📸",
  },
  {
    id: "portfolio-dev",
    name: "Портфолио (IT/дизайнер)",
    category: "personal",
    description: "Личный сайт разработчика, дизайнера, фрилансера. Проекты, навыки, контакты.",
    bestFor: ["разработчик", "дизайнер", "фрилансер", "портфолио", "резюме", "cv"],
    sections: ["hero", "about", "projects", "skills", "contact"],
    style: "tech-minimal",
    colorMood: "cool-mono",
    emoji: "💻",
  },
  {
    id: "wedding",
    name: "Свадебная страница",
    category: "event",
    description: "Сайт-приглашение на свадьбу. История пары, программа, локация, RSVP.",
    bestFor: ["свадьба", "приглашение", "молодожёны", "торжество"],
    sections: ["hero", "story", "schedule", "location", "rsvp"],
    style: "romantic",
    colorMood: "warm-pastel",
    emoji: "💒",
  },
  {
    id: "fitness-trainer",
    name: "Фитнес-тренер",
    category: "service",
    description: "Персональный тренер, фитнес-студия. Программы, цены, запись на тренировку.",
    bestFor: ["тренер", "фитнес", "зал", "тренировки", "спорт", "похудение"],
    sections: ["hero", "programs", "about", "pricing", "contact"],
    style: "energetic",
    colorMood: "bold-contrast",
    emoji: "💪",
  },
  {
    id: "restaurant",
    name: "Ресторан",
    category: "food",
    description: "Лендинг для ресторана. Атмосфера, меню с фото, бронирование столика.",
    bestFor: ["ресторан", "кухня", "шеф", "ужин", "бронь"],
    sections: ["hero", "about", "menu-highlights", "gallery", "booking", "location"],
    style: "elegant-dark",
    colorMood: "dark-premium",
    emoji: "🍽️",
  },
  {
    id: "tutor",
    name: "Репетитор / Преподаватель",
    category: "service",
    description: "Репетитор по языкам, математике, подготовка к экзаменам. Цены, отзывы, запись.",
    bestFor: ["репетитор", "преподаватель", "уроки", "обучение", "язык", "экзамен", "цт", "егэ"],
    sections: ["hero", "subjects", "about", "pricing", "reviews", "contact"],
    style: "academic-warm",
    colorMood: "light-minimal",
    emoji: "📚",
  },
  {
    id: "beauty-master",
    name: "Мастер красоты",
    category: "beauty",
    description: "Маникюр, брови, ресницы, визаж. Работы, прайс, запись.",
    bestFor: ["маникюр", "ногти", "брови", "ресницы", "визажист", "косметолог"],
    sections: ["hero", "services", "gallery", "pricing", "booking"],
    style: "feminine-soft",
    colorMood: "warm-pastel",
    emoji: "💅",
  },
  {
    id: "car-service",
    name: "Автосервис / СТО",
    category: "service",
    description: "Ремонт авто, шиномонтаж, диагностика. Услуги, цены, контакты.",
    bestFor: ["сто", "автосервис", "ремонт", "шиномонтаж", "диагностика", "авто"],
    sections: ["hero", "services", "pricing", "why-us", "contact"],
    style: "industrial",
    colorMood: "bold-contrast",
    emoji: "🔧",
  },
  {
    id: "handmade-shop",
    name: "Хендмейд / Мастерская",
    category: "creative",
    description: "Торты на заказ, свечи, керамика, украшения. Галерея работ и заказ.",
    bestFor: ["торты", "хендмейд", "украшения", "свечи", "керамика", "на заказ", "мастерская"],
    sections: ["hero", "gallery", "about", "order-form", "contact"],
    style: "cozy-craft",
    colorMood: "warm-pastel",
    emoji: "🎨",
  },
  {
    id: "dj-music",
    name: "DJ / Музыкант",
    category: "creative",
    description: "Сайт диджея, музыканта, группы. Треки, ивенты, бронь на мероприятие.",
    bestFor: ["dj", "диджей", "музыкант", "группа", "ивент", "вечеринка"],
    sections: ["hero", "tracks", "events", "booking", "contact"],
    style: "neon-club",
    colorMood: "vibrant-neon",
    emoji: "🎧",
  },
  {
    id: "saas-landing",
    name: "SaaS / Продукт",
    category: "business",
    description: "Лендинг для digital-продукта, приложения, SaaS. Фичи, цены, CTA на регистрацию.",
    bestFor: ["saas", "приложение", "сервис", "стартап", "продукт", "b2b"],
    sections: ["hero", "features", "how-it-works", "pricing", "testimonials", "cta"],
    style: "tech-modern",
    colorMood: "cool-mono",
    emoji: "🚀",
  },
  {
    id: "medical-clinic",
    name: "Медцентр / Клиника",
    category: "service",
    description: "Стоматология, медцентр, клиника. Услуги, врачи, запись на приём.",
    bestFor: ["стоматология", "клиника", "медцентр", "врач", "приём", "лечение"],
    sections: ["hero", "services", "doctors", "pricing", "booking", "contact"],
    style: "clean-medical",
    colorMood: "light-minimal",
    emoji: "🦷",
  },
  {
    id: "yoga-studio",
    name: "Йога / Wellness",
    category: "service",
    description: "Йога-студия, медитация, wellness. Расписание, инструкторы, запись.",
    bestFor: ["йога", "медитация", "wellness", "студия", "практика"],
    sections: ["hero", "classes", "instructors", "schedule", "pricing", "contact"],
    style: "zen-soft",
    colorMood: "earth-natural",
    emoji: "🧘",
  },
  {
    id: "blank-landing",
    name: "Универсальный (fallback)",
    category: "generic",
    description: "Базовый каркас лендинга на случай если ничего не подходит. Hero, about, features, contact.",
    bestFor: ["любой бизнес", "общий", "универсальный"],
    sections: ["hero", "about", "features", "contact"],
    style: "neutral-modern",
    colorMood: "light-minimal",
    emoji: "📄",
  },
];
export function getTemplateById(id: string): TemplateMeta | null {
  return TEMPLATE_CATALOG.find((t) => t.id === id) ?? null;
}

export function getFallbackTemplate(): TemplateMeta {
  return TEMPLATE_CATALOG.find((t) => t.id === "blank-landing")!;
}

export function buildCatalogForPrompt(): string {
  return TEMPLATE_CATALOG.map(
    (t) => `- ${t.id}: ${t.name} — ${t.description} (подходит для: ${t.bestFor.join(", ")})`,
  ).join("\n");
}
