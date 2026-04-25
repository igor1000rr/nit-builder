/**
 * HeroSection — fold-1 экран лендинга. Большой glitch-заголовок,
 * value-prop, две CTA-кнопки, статистика 0₽/∞/LOCAL/MIT,
 * справа — animated TerminalCodeCard.
 */

import { Chip, GlitchHeading, NitButton, RevealOnScroll } from "~/components/nit";
import { TerminalCodeCard } from "~/components/nit/TerminalCodeCard";

type Props = {
  isAuthed: boolean;
};

export function HeroSection({ isAuthed }: Props) {
  return (
    <header className="relative z-10 max-w-[1400px] mx-auto px-8 pt-[140px] pb-20 grid lg:grid-cols-[1.2fr_0.8fr] gap-16 items-center min-h-screen">
      <div>
        <RevealOnScroll>
          <Chip color="acid">⏵ Built on your own GPU</Chip>
        </RevealOnScroll>

        <RevealOnScroll delay={100}>
          <div className="mt-8">
            <GlitchHeading lines={["Build.", "Host.", ["OWN.", "glitch"]]} />
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={200}>
          <p className="text-[16px] leading-[1.7] text-[color:var(--muted)] max-w-[520px] mb-10">
            AI-конструктор HTML-сайтов, который генерирует код на{" "}
            <span className="nit-mark">твоём GPU</span> через peer-to-peer
            туннель. Никакого облака. Никакой подписки. Никаких лимитов
            токенов. Только <span className="nit-mark">LM Studio</span> на
            твоей машине и брутально простой UI здесь.
          </p>
        </RevealOnScroll>

        <RevealOnScroll delay={300}>
          <div className="flex flex-wrap gap-4 mb-12">
            <NitButton href={isAuthed ? "/" : "/register"} variant="primary">
              {isAuthed ? "Open editor →" : "Get started →"}
            </NitButton>
            <NitButton href="#how" variant="ghost">
              How it works
            </NitButton>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={400}>
          <div
            className="flex flex-wrap gap-10 pt-8"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <Stat n="0₽" l="Subscription cost" />
            <Stat n="∞" l="Generations / day" />
            <Stat n="LOCAL" l="Your GPU only" />
            <Stat n="MIT" l="Open source" />
          </div>
        </RevealOnScroll>
      </div>

      <RevealOnScroll delay={150}>
        <TerminalCodeCard />
      </RevealOnScroll>
    </header>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <span
        className="nit-display block text-[28px]"
        style={{ color: "var(--accent-glow)" }}
      >
        {n}
      </span>
      <span className="text-[10px] tracking-[0.15em] uppercase text-[color:var(--muted)] mt-1 block">
        {l}
      </span>
    </div>
  );
}
