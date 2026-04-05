import { TEMPLATE_CATALOG } from "~/lib/config/htmlTemplatesCatalog";

type Props = {
  onSelect: (prompt: string) => void;
};

const QUICK_PROMPTS: Record<string, string> = {
  "coffee-shop": "Сайт для уютной кофейни в центре города. Меню, часы работы, адрес, контакты.",
  "barbershop": "Брутальный сайт барбершопа. Услуги, цены, мастера, онлайн-запись.",
  "photographer": "Портфолио свадебного фотографа с галереей работ и ценами.",
  "portfolio-dev": "Личный сайт full-stack разработчика с проектами и контактами.",
  "wedding": "Свадебное приглашение с историей пары, программой дня и RSVP.",
  "fitness-trainer": "Сайт персонального тренера с программами и записью на тренировку.",
  "restaurant": "Элегантный сайт ресторана с меню, фото зала и бронированием.",
  "tutor": "Сайт репетитора по английскому языку с ценами и отзывами.",
  "beauty-master": "Сайт мастера маникюра с работами, прайсом и записью.",
  "car-service": "Сайт СТО с услугами, ценами и контактами.",
  "handmade-shop": "Сайт домашней кондитерской, торты на заказ с галереей работ.",
  "dj-music": "Сайт диджея с треками, афишей и бронью на мероприятие.",
  "saas-landing": "Лендинг SaaS-продукта с фичами, ценами и CTA на регистрацию.",
  "medical-clinic": "Сайт стоматологической клиники с услугами, врачами и записью.",
  "yoga-studio": "Сайт йога-студии с расписанием, инструкторами и ценами.",
  "tattoo-studio": "Брутальный сайт тату-студии с мастерами, стилями и галереей работ.",
  "flower-shop": "Нежный сайт цветочного магазина с букетами и доставкой.",
  "language-school": "Сайт школы английского с курсами, преподавателями и ценами.",
  "legal-firm": "Строгий сайт юридической компании с услугами и командой.",
  "game-studio": "Сайт инди-геймстудии с играми, devlog и комьюнити.",
  "real-estate": "Сайт агентства недвижимости с объектами и риелторами.",
};

export function TemplateGrid({ onSelect }: Props) {
  const templates = TEMPLATE_CATALOG.filter((t) => t.id !== "blank-landing");

  return (
    <div className="w-full">
      <p className="text-center text-sm text-slate-500 mb-4">или выбери готовый шаблон</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-w-4xl mx-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(QUICK_PROMPTS[t.id] ?? t.description)}
            className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-blue-500/50 transition"
          >
            <span className="text-3xl group-hover:scale-110 transition">{t.emoji}</span>
            <span className="text-xs text-slate-400 group-hover:text-white text-center leading-tight">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
