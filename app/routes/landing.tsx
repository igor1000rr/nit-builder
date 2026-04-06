import { useAuth } from "~/lib/contexts/AuthContext";
import {
  GridBg,
  Orbs,
  RevealOnScroll,
  NitButton,
  Card,
  SectionLabel,
  GlitchHeading,
  Chip,
  StatusDot,
  Marquee,
  Particles,
  ScanLine,
} from "~/components/nit";

export function meta() {
  return [
    { title: "NIT Builder // AI sites on your own GPU" },
    {
      name: "description",
      content:
        "AI-конструктор сайтов, работающий на твоём GPU через peer-to-peer туннель. Никакого облака, никакой подписки, открытый исходник.",
    },
  ];
}

export default function Landing() {
  const auth = useAuth();
  const isAuthed = auth.status === "authenticated";

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[color:var(--ink)] nit-grain">
      <GridBg />
      <Orbs />
      <Particles count={35} />
      <ScanLine />

      {/* ─── NAV ─────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-[12px]"
        style={{
          background: "rgba(5,6,10,0.55)",
          borderBottom: "1px solid var(--line)",
          padding: "20px 32px",
        }}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 no-underline">
            <span
              className="block w-7 h-7 relative"
              style={{
                background: "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
                animation: "nit-spin 8s linear infinite",
              }}
            >
              <span
                className="absolute inset-[3px]"
                style={{ background: "var(--bg)" }}
              />
            </span>
            <span className="nit-display text-lg text-[color:var(--ink)]">NIT.BUILDER</span>
          </a>

          <ul className="hidden md:flex gap-8 list-none text-[11px] tracking-[0.15em] uppercase">
            <li>
              <a href="#problem" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
                Problem
              </a>
            </li>
            <li>
              <a href="#how" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
                How it works
              </a>
            </li>
            <li>
              <a href="#stack" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
                Stack
              </a>
            </li>
            <li>
              <a href="#features" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
                Features
              </a>
            </li>
          </ul>

          <a
            href={isAuthed ? "/" : "/register"}
            className="px-5 py-2.5 text-[11px] font-bold tracking-[0.15em] uppercase no-underline transition"
            style={{
              border: "1px solid var(--accent)",
              color: "var(--accent-glow)",
            }}
          >
            {isAuthed ? "Open app →" : "Launch app"}
          </a>
        </div>
      </nav>

      {/* ─── HERO ────────────────────────────────────────────── */}
      <header className="relative z-10 max-w-[1400px] mx-auto px-8 pt-[140px] pb-20 grid lg:grid-cols-[1.2fr_0.8fr] gap-16 items-center min-h-screen">
        <div>
          <RevealOnScroll>
            <Chip color="acid">⏵ Built on your own GPU</Chip>
          </RevealOnScroll>

          <RevealOnScroll delay={100}>
            <div className="mt-8">
              <GlitchHeading
                lines={["Build.", "Host.", ["OWN.", "glitch"]]}
              />
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

        {/* Tunnel card — заменяет NFT-карту из TonForge */}
        <RevealOnScroll delay={150}>
          <TunnelCard />
        </RevealOnScroll>
      </header>

      {/* ─── MARQUEE ─────────────────────────────────────────── */}
      <Marquee
        items={[
          { text: "YOUR GPU" },
          { text: "YOUR CODE", variant: "outline" },
          { text: "✦", variant: "star" },
          { text: "NO CLOUD" },
          { text: "NO LIMITS", variant: "outline" },
          { text: "✦", variant: "star" },
          { text: "OPEN SOURCE" },
          { text: "ZERO BULLSHIT", variant: "outline" },
          { text: "✦", variant: "star" },
        ]}
      />

      {/* ─── PROBLEM ─────────────────────────────────────────── */}
      <section id="problem" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
        <RevealOnScroll>
          <SectionLabel number="01">The broken market</SectionLabel>
        </RevealOnScroll>
        <RevealOnScroll>
          <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-6 max-w-[900px]">
            Облачные AI-билдеры{" "}
            <em className="not-italic" style={{ color: "transparent", WebkitTextStroke: "1.5px var(--magenta)" }}>
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
              Никто не делает <b className="font-bold" style={{ color: "var(--acid)" }}>peer-to-peer</b>{" "}
              генератор где LLM крутится на железе пользователя, а сервер только
              маршрутизирует запросы. Мы делаем.
            </p>
          </div>
        </RevealOnScroll>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────── */}
      <section id="how" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
        <RevealOnScroll>
          <SectionLabel number="02">How it works</SectionLabel>
        </RevealOnScroll>
        <RevealOnScroll>
          <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-16">
            Четыре шага.<br />Один <em className="not-italic" style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}>тоннель</em>.
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

      {/* ─── STACK ───────────────────────────────────────────── */}
      <section id="stack" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
        <div className="flex justify-between items-end mb-12 flex-wrap gap-6">
          <div>
            <RevealOnScroll>
              <SectionLabel number="03">Hardware tier</SectionLabel>
            </RevealOnScroll>
            <RevealOnScroll>
              <h2 className="nit-display text-[clamp(36px,5vw,72px)]">
                Какое железо<br />тебе хватит
              </h2>
            </RevealOnScroll>
          </div>
          <RevealOnScroll>
            <p className="text-[12px] text-[color:var(--muted)] max-w-[320px] leading-[1.7]">
              Минимум — 4ГБ VRAM. Оптимально — 8ГБ. Без GPU тоже работает через
              облачные провайдеры (Groq, OpenRouter), но смысл теряется.
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

      {/* ─── FEATURES ────────────────────────────────────────── */}
      <section id="features" className="relative z-10 max-w-[1400px] mx-auto px-8 py-32">
        <RevealOnScroll>
          <SectionLabel number="04">What's inside</SectionLabel>
        </RevealOnScroll>
        <RevealOnScroll>
          <h2 className="nit-display text-[clamp(36px,5vw,72px)] mb-12">
            Брутально <em className="not-italic" style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}>простой</em> стек
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

      {/* ─── CTA BIG ─────────────────────────────────────────── */}
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
                Готов запустить<br />
                свой <em className="not-italic" style={{ color: "transparent", WebkitTextStroke: "1.5px var(--magenta)" }}>тоннель</em>?
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

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <footer
        className="relative z-10 max-w-[1400px] mx-auto px-8 pt-16 pb-8"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          <div className="col-span-2">
            <div className="nit-display text-[42px] leading-[0.9] mb-4">
              NIT
              <span style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}>
                .BUILDER
              </span>
            </div>
            <p className="text-[12px] text-[color:var(--muted)] leading-[1.7] max-w-[320px]">
              Peer-to-peer AI-конструктор сайтов. Open source. MIT license.
              Built in Belarus, hosted on bare metal, runs on your GPU.
            </p>
          </div>
          <FootCol
            title="Product"
            items={[
              ["Editor", "/"],
              ["Download CLI", "/download"],
              ["Templates", "/#stack"],
            ]}
          />
          <FootCol
            title="Project"
            items={[
              ["GitHub", "https://github.com/igor1000rr/nit-builder"],
              ["Changelog", "https://github.com/igor1000rr/nit-builder/blob/main/CHANGELOG.md"],
              ["License", "https://github.com/igor1000rr/nit-builder/blob/main/LICENSE"],
            ]}
          />
        </div>
        <div
          className="flex justify-between flex-wrap gap-4 pt-8 text-[10px] tracking-[0.1em] uppercase text-[color:var(--muted)]"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <div>© 2026 · NIT.BUILDER · v2.0.0-alpha</div>
          <div>Built with rage in Belarus · No cloud, no compromise</div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS (только для landing — никуда больше не нужны)
   ═══════════════════════════════════════════════════════════════ */

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

function TunnelCard() {
  return (
    <div
      className="relative flex justify-center items-center"
      style={{ perspective: 1200 }}
    >
      <div
        className="absolute w-[120%] h-[120%] pointer-events-none"
        style={{
          border: "1px dashed var(--line-strong)",
          borderRadius: "50%",
          animation: "nit-spin 30s linear infinite",
        }}
      >
        <span
          className="absolute -top-1 left-1/2 w-2 h-2 rounded-full"
          style={{
            background: "var(--magenta)",
            boxShadow: "0 0 15px var(--magenta)",
          }}
        />
      </div>
      <div
        className="relative w-[340px] h-[460px]"
        style={{
          transformStyle: "preserve-3d",
          animation: "nit-tilt 8s ease-in-out infinite",
        }}
      >
        <div
          className="absolute inset-0 p-7 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #0a0d18 0%, #0d1628 50%, #1a0d28 100%)",
            border: "1px solid var(--line-strong)",
            boxShadow:
              "0 30px 80px rgba(0,212,255,.25), 0 0 0 1px rgba(92,233,255,.1), inset 0 1px 0 rgba(255,255,255,.05)",
          }}
        >
          {/* corner glows */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 10%, rgba(92,233,255,.25), transparent 40%), radial-gradient(circle at 80% 90%, rgba(255,46,147,.2), transparent 40%)",
            }}
          />
          {/* diagonal hatch */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(45deg, transparent 0, transparent 40px, rgba(92,233,255,.03) 40px, rgba(92,233,255,.03) 41px)",
            }}
          />

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <Chip color="acid">⏵ Tunnel · Live</Chip>
              <span className="text-[10px] text-[color:var(--muted)] tracking-[0.1em]">
                #4719
              </span>
            </div>

            <div
              className="h-[200px] mb-5 relative flex items-center justify-center overflow-hidden"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, var(--accent) 0%, transparent 60%), linear-gradient(135deg, #001830, #2a0040)",
              }}
            >
              <svg
                viewBox="0 0 100 100"
                fill="none"
                style={{
                  width: "80%",
                  height: "80%",
                  filter: "drop-shadow(0 0 20px var(--accent-glow))",
                }}
              >
                <defs>
                  <linearGradient id="tg1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#5ce9ff" />
                    <stop offset="1" stopColor="#ff2e93" />
                  </linearGradient>
                </defs>
                {/* Stylized "tunnel" — 3 nested hexagons */}
                <path
                  d="M50 8 L86 28 L86 72 L50 92 L14 72 L14 28 Z"
                  stroke="url(#tg1)"
                  strokeWidth="2"
                  fill="rgba(92,233,255,.05)"
                />
                <path
                  d="M50 22 L74 36 L74 64 L50 78 L26 64 L26 36 Z"
                  stroke="url(#tg1)"
                  strokeWidth="1.2"
                  fill="none"
                  opacity="0.7"
                />
                <circle cx="50" cy="50" r="10" fill="url(#tg1)" opacity="0.85" />
                <circle
                  cx="50"
                  cy="50"
                  r="18"
                  stroke="#d4ff00"
                  strokeWidth="0.6"
                  fill="none"
                  opacity="0.5"
                />
                {/* "data flow" lines */}
                <path
                  d="M50 22 L50 78 M26 36 L74 64 M74 36 L26 64"
                  stroke="url(#tg1)"
                  strokeWidth="0.6"
                  opacity="0.5"
                />
              </svg>
            </div>

            <div className="nit-display text-[22px] mb-1.5">
              Your Mac · M1 Max
            </div>
            <div className="text-[11px] text-[color:var(--muted)] mb-5 tracking-[0.05em]">
              Qwen2.5-Coder · 7B · Q4_K_M
            </div>

            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <Meta k="Throughput" v="48 t/s" />
              <Meta k="Latency" v="180ms" />
              <Meta k="Runtime" v="LM Studio" />
              <Meta k="Status" v="LIVE" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div className="text-[color:var(--muted)] tracking-[0.1em] uppercase mb-0.5">
        {k}
      </div>
      <div className="font-bold" style={{ color: "var(--accent-glow)" }}>
        {v}
      </div>
    </div>
  );
}

const PROBLEMS: Array<{ num: string; tag: string; title: string; text: string; tagColor?: "accent" | "acid" | "magenta" }> = [
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

function ProblemCard({ num, tag, title, text }: typeof PROBLEMS[0]) {
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

const STEPS: Array<{ n: string; title: string; text: string }> = [
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

function StepCard({ n, title, text }: typeof STEPS[0]) {
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

const HARDWARE: Array<{ tier: string; vram: string; model: string; note: string; color: "accent" | "acid" | "magenta" | "violet" }> = [
  { tier: "Minimum", vram: "4 GB", model: "Coder-3B Q4", note: "Медленно но работает", color: "magenta" },
  { tier: "Recommended", vram: "8 GB", model: "Coder-7B Q4", note: "Sweet spot · отличное качество", color: "acid" },
  { tier: "Pro", vram: "12+ GB", model: "Coder-14B Q4", note: "Максимум качество", color: "accent" },
  { tier: "No GPU", vram: "Cloud", model: "Groq · OR", note: "Бесплатные лимиты, нужен интернет", color: "violet" },
];

function HardwareCell({ tier, vram, model, note, color }: typeof HARDWARE[0]) {
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

const FEATURES: Array<{ title: string; text: string }> = [
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

function FootCol({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div>
      <h5 className="text-[11px] tracking-[0.2em] uppercase mb-5" style={{ color: "var(--accent-glow)" }}>
        {title}
      </h5>
      <ul className="list-none flex flex-col gap-2.5">
        {items.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-[12px] text-[color:var(--muted)] hover:text-[color:var(--ink)] no-underline transition"
              {...(href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
