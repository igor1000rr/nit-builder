/**
 * ProblemSection — секция "01 · The broken market".
 * 4 problem cards (Cloud cost / Privacy / Vendor lock / Censorship)
 * + acid-bordered блок с peer-to-peer pitch'ем.
 */

import { Card, Chip, RevealOnScroll, SectionLabel } from "~/components/nit";

type Problem = {
  num: string;
  tag: string;
  title: string;
  text: string;
};

const PROBLEMS: Problem[] = [
  {
    num: "01",
    tag: "Cloud LLM cost",
    title: "Vercel v0 · Bolt · Lovable",
    text: "Платная подписка $20/мес или жёсткие лимиты. Каждая правка сжигает токены. Правишь дизайн 3 раза — лимит на день съеден.",
  },
  {
    num: "02",
    tag: "Privacy",
    title: "Твой промпт уезжает в прод",
    text: "OpenAI, Anthropic, Vercel логируют всё. Корпоративный NDA? Внутренние данные? Лучше не вставляй — кто-то это прочитает.",
  },
  {
    num: "03",
    tag: "Vendor lock",
    title: "Чёрные ящики и API",
    text: "Сегодня Lovable работает, завтра передумали и закрыли — твои сайты не экспортируешь. Зависишь от чужого стартапа в чужой стране.",
  },
  {
    num: "04",
    tag: "Censorship",
    title: "Кто-то решает что тебе можно",
    text: "Random content moderator завернёт промпт за «триггерное слово». Шутка про политику? Кибербез research? Получи 'I cannot help'.",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
      <RevealOnScroll>
        <SectionLabel number="01">The broken market</SectionLabel>
      </RevealOnScroll>
      <RevealOnScroll>
        <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-6 max-w-[900px]">
          Облачные AI-билдеры{" "}
          <em
            className="not-italic"
            style={{ color: "transparent", WebkitTextStroke: "1.5px var(--magenta)" }}
          >
            сломаны
          </em>
          .<br />
          И все делают вид, что так и надо.
        </h2>
      </RevealOnScroll>
      <RevealOnScroll delay={100}>
        <p className="text-[15px] text-[color:var(--muted)] max-w-[600px] leading-[1.7] mb-16">
          Vercel v0, Bolt, Lovable — все они продают одну и ту же модель: твой
          промпт уезжает в их облако, кто-то сжигает твои токены, кто-то
          читает твои данные, кто-то решает что тебе можно генерить.
        </p>
      </RevealOnScroll>

      <div className="grid md:grid-cols-2 gap-6">
        {PROBLEMS.map((p, i) => (
          <RevealOnScroll key={p.title} delay={i * 80}>
            <ProblemCard {...p} />
          </RevealOnScroll>
        ))}
      </div>

      <RevealOnScroll delay={200}>
        <div
          className="mt-16 p-10 max-w-[900px]"
          style={{
            borderLeft: "3px solid var(--acid)",
            background: "rgba(212,255,0,0.03)",
          }}
        >
          <p className="nit-display text-[24px] font-light leading-[1.4]">
            Никто не делает{" "}
            <b className="font-bold" style={{ color: "var(--acid)" }}>
              peer-to-peer
            </b>{" "}
            генератор где LLM крутится на железе пользователя, а сервер только
            маршрутизирует запросы. Мы делаем.
          </p>
        </div>
      </RevealOnScroll>
    </section>
  );
}

function ProblemCard({ num, tag, title, text }: Problem) {
  return (
    <Card hoverable className="p-8 group">
      <span
        className="nit-display absolute top-3 right-5 text-[64px] opacity-20 transition-colors"
        style={{ color: "var(--accent)" }}
      >
        {num}
      </span>
      <div className="relative">
        <Chip color="acid">{tag}</Chip>
        <h3 className="nit-display text-[22px] mt-4 mb-3">{title}</h3>
        <p className="text-[13px] text-[color:var(--muted)] leading-[1.7]">
          {text}
        </p>
      </div>
    </Card>
  );
}
