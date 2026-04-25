/**
 * HardwareSection — секция "03 · Hardware tier".
 * 4-cell grid с тирами VRAM (Minimum/Recommended/Pro/Apple Silicon).
 */

import { RevealOnScroll, SectionLabel } from "~/components/nit";

type Hardware = {
  tier: string;
  vram: string;
  model: string;
  note: string;
  color: "accent" | "acid" | "magenta" | "violet";
};

const HARDWARE: Hardware[] = [
  { tier: "Minimum", vram: "4 GB", model: "Coder-3B Q4", note: "Бюджетные карты, медленно но работает", color: "magenta" },
  { tier: "Recommended", vram: "8 GB", model: "Coder-7B Q4", note: "Sweet spot · отличное качество", color: "acid" },
  { tier: "Pro", vram: "12+ GB", model: "Coder-14B Q4", note: "Максимум качество, быстро", color: "accent" },
  { tier: "Apple Silicon", vram: "M1-M4", model: "MLX · Coder-7B", note: "Unified memory, без выделенного GPU", color: "violet" },
];

export function HardwareSection() {
  return (
    <section id="stack" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
      <div className="flex justify-between items-end mb-12 flex-wrap gap-6">
        <div>
          <RevealOnScroll>
            <SectionLabel number="03">Hardware tier</SectionLabel>
          </RevealOnScroll>
          <RevealOnScroll>
            <h2 className="nit-display text-[clamp(36px,5vw,72px)]">
              Какое железо
              <br />
              тебе хватит
            </h2>
          </RevealOnScroll>
        </div>
        <RevealOnScroll>
          <p className="text-[12px] text-[color:var(--muted)] max-w-[320px] leading-[1.7]">
            Минимум — 4ГБ VRAM. Оптимально — 8ГБ. Apple Silicon (M1/M2/M3/M4)
            работает без выделенного GPU — модель грузится в unified memory.
            Никаких облачных API. Только локальный inference.
          </p>
        </RevealOnScroll>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px"
        style={{
          background: "var(--line-strong)",
          border: "1px solid var(--line-strong)",
        }}
      >
        {HARDWARE.map((h, i) => (
          <RevealOnScroll key={h.tier} delay={i * 60}>
            <HardwareCell {...h} />
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

function HardwareCell({ tier, vram, model, note, color }: Hardware) {
  const c = {
    accent: "var(--accent-glow)",
    acid: "var(--acid)",
    magenta: "var(--magenta)",
    violet: "var(--violet-glow)",
  }[color];
  return (
    <div className="p-8 min-h-[260px] flex flex-col justify-between" style={{ background: "var(--bg)" }}>
      <div>
        <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: c }}>
          {tier}
        </div>
        <div className="nit-display text-[36px] mb-2" style={{ color: "var(--ink)" }}>
          {vram}
        </div>
        <div className="text-[11px] text-[color:var(--muted)] tracking-[0.05em] mb-5">
          {model}
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] leading-[1.6]">{note}</div>
    </div>
  );
}
