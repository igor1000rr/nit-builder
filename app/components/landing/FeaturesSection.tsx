/**
 * FeaturesSection — секция "04 · What's inside".
 * 6-cell grid с ключевыми фичами (streaming preview, polish, templates, etc).
 */

import { RevealOnScroll, SectionLabel } from "~/components/nit";

type Feature = { title: string; text: string };

const FEATURES: Feature[] = [
  {
    title: "Live streaming preview",
    text: "Код стримится в iframe прямо из твоего GPU через WebSocket. Видишь как сайт собирается по мере генерации, не ждёшь финала.",
  },
  {
    title: "Pipeline visibility",
    text: "Не чёрный ящик. Видишь что AI делает: analyze → template → code. Каждый шаг — отдельный лейбл с прогрессом.",
  },
  {
    title: "Polish via chat",
    text: "После генерации не начинаешь с нуля — пишешь правки в чат справа: 'сделай кнопки больше', 'добавь форму' — AI редактирует HTML.",
  },
  {
    title: "Template library",
    text: "22 шаблона на старте: лендинги, портфолио, кофейни, барбершопы, репетиторы. Все Tailwind CDN, ноль зависимостей.",
  },
  {
    title: "Export anywhere",
    text: "Один HTML-файл. GitHub Pages, Netlify, Vercel, обычный shared hosting — куда угодно. Никакого билд-степа, никакого фреймворка.",
  },
  {
    title: "Open source · MIT",
    text: "Весь код на GitHub. Форкни, разверни у себя, прикрути свою модель. Никакой телеметрии, никаких трекеров.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
      <RevealOnScroll>
        <SectionLabel number="04">What&apos;s inside</SectionLabel>
      </RevealOnScroll>
      <RevealOnScroll>
        <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-12">
          Брутально{" "}
          <em
            className="not-italic"
            style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}
          >
            простой
          </em>{" "}
          стек
        </h2>
      </RevealOnScroll>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px mt-12"
        style={{
          background: "var(--line-strong)",
          border: "1px solid var(--line-strong)",
        }}
      >
        {FEATURES.map((f, i) => (
          <RevealOnScroll key={f.title} delay={i * 60}>
            <FeatureCell {...f} num={`/0${i + 1}`} />
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

function FeatureCell({ num, title, text }: { num: string; title: string; text: string }) {
  return (
    <div
      className="relative p-10 transition-colors hover:bg-[rgba(0,212,255,0.04)] group"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
        style={{ background: "var(--accent)" }}
      />
      <div className="text-[11px] text-[color:var(--muted)] tracking-[0.2em] mb-5">
        {num}
      </div>
      <h4 className="nit-display text-[22px] mb-3 leading-[1.2]">{title}</h4>
      <p className="text-[13px] text-[color:var(--muted)] leading-[1.7]">{text}</p>
    </div>
  );
}
