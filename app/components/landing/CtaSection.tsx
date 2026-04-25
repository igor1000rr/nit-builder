/**
 * CtaSection — финальный CTA-блок перед футером ("Готов запустить тоннель?").
 * Большая центрированная карточка с radial-gradient + двумя кнопками.
 */

import { NitButton, RevealOnScroll } from "~/components/nit";

type Props = {
  isAuthed: boolean;
};

export function CtaSection({ isAuthed }: Props) {
  return (
    <section className="relative z-10 max-w-[1200px] mx-auto px-8 my-32">
      <RevealOnScroll>
        <div
          className="relative overflow-hidden text-center px-10 py-24"
          style={{
            border: "1px solid var(--line-strong)",
            background:
              "radial-gradient(ellipse at center, rgba(0,212,255,0.15), transparent 70%)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, #000, transparent 70%)",
              maskImage: "radial-gradient(ellipse at center, #000, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-6">
              Готов запустить
              <br />
              свой{" "}
              <em
                className="not-italic"
                style={{ color: "transparent", WebkitTextStroke: "1.5px var(--magenta)" }}
              >
                тоннель
              </em>
              ?
            </h2>
            <p className="text-[15px] text-[color:var(--muted)] mb-10">
              Регистрация в один клик. Туннель-клиент скачивается отдельно.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <NitButton href={isAuthed ? "/" : "/register"} variant="primary">
                {isAuthed ? "Go to editor →" : "Register →"}
              </NitButton>
              <NitButton href="/download" variant="ghost">
                Download tunnel CLI
              </NitButton>
            </div>
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}
