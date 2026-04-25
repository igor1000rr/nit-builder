/**
 * HowItWorksSection — секция "02 · How it works".
 * 4 step cards (LM Studio install / Register / CLI / Generate)
 * + animated SVG ArchDiagram (Browser → Server → Your GPU).
 */

import { RevealOnScroll, SectionLabel } from "~/components/nit";

type Step = {
  n: string;
  title: string;
  text: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Install LM Studio",
    text: "Бесплатно. Скачай Qwen2.5-Coder-7B (8 ГБ VRAM достаточно). Запусти Local Server.",
  },
  {
    n: "02",
    title: "Register & get token",
    text: "Один email. Получаешь персональный tunnel-token, которым CLI авторизуется в нашем сервере.",
  },
  {
    n: "03",
    title: "Start tunnel CLI",
    text: "На своём Mac/PC запускаешь nit-tunnel — он держит WebSocket к серверу и проксирует запросы в LM Studio.",
  },
  {
    n: "04",
    title: "Generate from browser",
    text: "Открываешь editor, пишешь промпт, видишь как код стримится из твоего GPU. Никакой подписки.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
      <RevealOnScroll>
        <SectionLabel number="02">How it works</SectionLabel>
      </RevealOnScroll>
      <RevealOnScroll>
        <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-16">
          Четыре шага.
          <br />
          Один{" "}
          <em
            className="not-italic"
            style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}
          >
            тоннель
          </em>
          .
        </h2>
      </RevealOnScroll>

      <div className="grid lg:grid-cols-2 gap-20 items-start">
        <div className="flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <RevealOnScroll key={s.title} delay={i * 80}>
              <StepCard {...s} />
            </RevealOnScroll>
          ))}
        </div>

        <RevealOnScroll delay={200}>
          <ArchDiagram />
        </RevealOnScroll>
      </div>
    </section>
  );
}

function StepCard({ n, title, text }: Step) {
  return (
    <div
      className="grid grid-cols-[60px_1fr] gap-5 p-6 cursor-default transition-all duration-300 group hover:bg-[rgba(0,212,255,0.04)]"
      style={{ border: "1px solid var(--line)" }}
    >
      <div
        className="nit-display text-[42px] leading-none group-hover:text-[color:var(--magenta)] transition-colors"
        style={{ color: "var(--accent-glow)" }}
      >
        {n}
      </div>
      <div>
        <h4 className="nit-display text-[18px] mb-1.5">{title}</h4>
        <p className="text-[12px] text-[color:var(--muted)] leading-[1.6]">{text}</p>
      </div>
    </div>
  );
}

function ArchDiagram() {
  return (
    <div className="relative h-[500px] flex items-center justify-center">
      <svg viewBox="0 0 400 500" className="w-full h-full">
        <defs>
          <linearGradient id="flow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5ce9ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ff2e93" stopOpacity="0.9" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Browser node */}
        <g filter="url(#glow)">
          <rect x="120" y="30" width="160" height="80" fill="rgba(10,13,24,0.8)" stroke="#5ce9ff" strokeWidth="1.5" />
          <text x="200" y="58" textAnchor="middle" fill="#e8ecff" fontFamily="Unbounded" fontWeight="900" fontSize="14">
            BROWSER
          </text>
          <text x="200" y="78" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            EDITOR.TSX
          </text>
          <text x="200" y="95" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            chat ↔ preview
          </text>
        </g>

        {/* Arrow down 1 */}
        <line x1="200" y1="110" x2="200" y2="200" stroke="url(#flow)" strokeWidth="1.5" strokeDasharray="4,4">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1s" repeatCount="indefinite" />
        </line>
        <text x="210" y="160" fill="#5ce9ff" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1.5">
          WSS /api/control
        </text>

        {/* Server node */}
        <g filter="url(#glow)">
          <rect x="120" y="200" width="160" height="100" fill="rgba(10,13,24,0.8)" stroke="#9d4dff" strokeWidth="1.5" />
          <text x="200" y="232" textAnchor="middle" fill="#e8ecff" fontFamily="Unbounded" fontWeight="900" fontSize="14">
            NIT SERVER
          </text>
          <text x="200" y="252" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            VPS · 185.218.0.7
          </text>
          <text x="200" y="270" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            tunnelRegistry
          </text>
          <text x="200" y="288" textAnchor="middle" fill="#b87bff" fontFamily="JetBrains Mono" fontSize="8" letterSpacing="1">
            ROUTER ONLY · NO LLM
          </text>
        </g>

        {/* Arrow down 2 */}
        <line x1="200" y1="300" x2="200" y2="390" stroke="url(#flow)" strokeWidth="1.5" strokeDasharray="4,4">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1s" repeatCount="indefinite" />
        </line>
        <text x="210" y="350" fill="#5ce9ff" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1.5">
          WSS /api/tunnel
        </text>

        {/* User GPU node */}
        <g filter="url(#glow)">
          <rect x="100" y="390" width="200" height="90" fill="rgba(10,13,24,0.8)" stroke="#d4ff00" strokeWidth="1.5" />
          <text x="200" y="420" textAnchor="middle" fill="#d4ff00" fontFamily="Unbounded" fontWeight="900" fontSize="14">
            YOUR GPU
          </text>
          <text x="200" y="442" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            LM STUDIO · localhost:1234
          </text>
          <text x="200" y="460" textAnchor="middle" fill="#7a85b8" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2">
            Qwen2.5-Coder-7B
          </text>
        </g>

        {/* Side label */}
        <text x="20" y="250" fill="#525c85" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2" transform="rotate(-90 20 250)">
          PEER-TO-PEER FLOW
        </text>
      </svg>
    </div>
  );
}
