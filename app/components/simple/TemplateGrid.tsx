import { TEMPLATE_CATALOG } from "~/lib/config/htmlTemplatesCatalog";
import { TemplateIcon } from "~/components/nit/TemplateIcon";

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
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px"
        style={{
          background: "var(--line-strong)",
          border: "1px solid var(--line-strong)",
        }}
      >
        {templates.map((t, idx) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(QUICK_PROMPTS[t.id] ?? t.description)}
            className="group relative flex flex-col items-start gap-4 p-6 transition-all overflow-hidden"
            style={{ background: "var(--bg)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,212,255,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg)";
            }}
          >
            {/* top accent bar — появляется на hover */}
            <span
              className="absolute top-0 left-0 right-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
              style={{
                background: "var(--accent)",
                boxShadow: "0 0 12px var(--accent), 0 0 24px var(--accent)",
              }}
            />

            <div className="flex justify-between w-full items-start">
              <span
                className="text-[10px] tracking-[0.15em] font-mono"
                style={{ color: "var(--muted-2)" }}
              >
                /{String(idx + 1).padStart(2, "0")}
              </span>
              <span
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] tracking-[0.15em]"
                style={{ color: "var(--accent-glow)" }}
              >
                →
              </span>
            </div>

            <div
              className="transition-all duration-300 group-hover:scale-110 group-hover:text-[color:var(--accent-glow)]"
              style={{ color: "var(--ink-dim)" }}
            >
              <TemplateIcon id={t.id} className="w-9 h-9" />
            </div>

            <span
              className="text-[11px] tracking-[0.05em] leading-tight font-mono uppercase group-hover:text-[color:var(--ink)] transition-colors"
              style={{ color: "var(--muted)" }}
            >
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
