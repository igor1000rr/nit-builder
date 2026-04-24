import { useState } from "react";
import type { MetaFunction } from "react-router";
import { useAuth } from "~/lib/contexts/AuthContext";
import { AuthBadge } from "~/components/simple/AuthBadge";
import { SettingsDrawer } from "~/components/simple/SettingsDrawer";
import { GridBg, Orbs, Chip, NitButton, Particles } from "~/components/nit";

export const meta: MetaFunction = () => [
  { title: "Download tunnel CLI // NITGEN" },
  {
    name: "description",
    content:
      "NIT Tunnel CLI — клиент который проксирует твою LM Studio к серверу NITGEN через WebSocket.",
  },
];

// На HTTPS-странице браузер блокирует ws:// (mixed content). Раньше
// захардкоженный ws:// ломал инструкцию в production — генерировался URL
// который не сработает. Берём protocol от текущей страницы как в
// useControlSocket.ts. SSR-fallback тоже на wss:// — production deployment
// всегда HTTPS.
const SERVER_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/tunnel`
    : "wss://nit.vibecoding.by/api/tunnel";

export default function Download() {
  const auth = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function copy(text: string, key: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {
        // Clipboard API требует secure context (HTTPS) — если не сработал,
        // просто меняем метку на ошибочную, юзер копирует вручную.
        setCopied(`${key}-failed`);
        setTimeout(() => setCopied(null), 2000);
      });
  }

  return (
    <div className="relative min-h-screen text-[color:var(--ink)] nit-grain overflow-x-hidden">
      <GridBg />
      <Orbs />
      <Particles count={25} />
      <SettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Nav */}
      <nav
        className="relative z-10 px-8 py-5 max-w-[1400px] mx-auto flex justify-between items-center"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <a href="/" className="flex items-center gap-3 no-underline">
          <span
            className="block w-7 h-7 relative"
            style={{
              background:
                "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
              animation: "nit-spin 8s linear infinite",
            }}
          >
            <span className="absolute inset-[3px]" style={{ background: "var(--bg)" }} />
          </span>
          <span className="nit-display text-lg text-[color:var(--ink)]">NITGEN</span>
        </a>
        <div className="flex gap-2 items-center">
          <AuthBadge auth={auth} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </nav>

      <main className="relative z-10 max-w-3xl mx-auto px-8 pt-16 pb-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Chip color="accent">⏵ NIT Tunnel CLI · v0.1.0-alpha</Chip>
          </div>
          <h1 className="nit-display text-[clamp(40px,7vw,80px)] mb-6 leading-[0.9]">
            Connect<br />
            your <span style={{ color: "transparent", WebkitTextStroke: "2px var(--accent-glow)" }}>GPU.</span>
          </h1>
          <p
            className="text-[15px] max-w-[560px] mx-auto leading-[1.7]"
            style={{ color: "var(--muted)" }}
          >
            CLI-клиент проксирует твою локальную LM Studio к серверу NITGEN
            через WebSocket. Никакого облака, никаких лимитов, полная приватность.
          </p>
        </div>

        {/* Prerequisites */}
        <Section label="// requirements" title="What you need">
          <ul className="space-y-3 font-mono text-[13px]">
            <Req
              k="Node.js 20+"
              link={{ href: "https://nodejs.org", text: "nodejs.org" }}
              extra="или nvm"
            />
            <Req
              k="LM Studio 0.3+"
              link={{ href: "https://lmstudio.ai", text: "lmstudio.ai" }}
              extra="+ модель Qwen2.5-Coder-7B-Q4"
            />
            <Req
              k="Tunnel token"
              link={{ href: "/register", text: "register →" }}
              extra="получишь при регистрации"
            />
          </ul>
        </Section>

        {/* Step 1 */}
        <Step n="01" title="Start LM Studio">
          <p className="text-[12px] leading-[1.7]" style={{ color: "var(--muted)" }}>
            Открой LM Studio → загрузи модель → во вкладке{" "}
            <Mono>Server</Mono> нажми <Mono>Start Server</Mono>. По умолчанию слушает на{" "}
            <Mono>localhost:1234</Mono>.
          </p>
        </Step>

        {/* Step 2 */}
        <Step n="02" title="Clone & install">
          <CodeBlock
            code={`git clone https://github.com/igor1000rr/nit-builder.git
cd nit-builder
npm install`}
            copyKey="clone"
            copied={copied}
            onCopy={copy}
          />
        </Step>

        {/* Step 3 */}
        <Step n="03" title="Run tunnel with your token">
          <p className="text-[12px] mb-4" style={{ color: "var(--muted)" }}>
            Замени <Mono color="acid">YOUR_TOKEN</Mono> на свой из{" "}
            <a
              href="/register"
              className="no-underline transition"
              style={{ color: "var(--accent-glow)" }}
            >
              регистрации
            </a>
            .
          </p>
          <CodeBlock
            code={`cd tunnel
npm run dev -- \\
  --token YOUR_TOKEN \\
  --server ${SERVER_URL} \\
  --lm-studio http://localhost:1234/v1`}
            copyKey="run"
            copied={copied}
            onCopy={copy}
          />
        </Step>

        {/* Verify */}
        <div
          className="mb-10 p-6"
          style={{
            border: "1px solid var(--acid)",
            background: "rgba(212,255,0,0.04)",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-10 h-10 flex items-center justify-center text-[16px] font-bold text-black nit-display"
              style={{ background: "var(--acid)" }}
            >
              ✓
            </div>
            <div>
              <div
                className="text-[10px] tracking-[0.2em] uppercase mb-2"
                style={{ color: "var(--acid)" }}
              >
                // success
              </div>
              <h3 className="nit-display text-[20px] mb-2">Tunnel online</h3>
              <p className="text-[12px] leading-[1.7]" style={{ color: "var(--muted)" }}>
                Если в терминале появилось <Mono color="acid">✓ Authenticated as user...</Mono>{" "}
                — туннель подключён. Возвращайся в{" "}
                <a
                  href="/"
                  className="no-underline transition"
                  style={{ color: "var(--accent-glow)" }}
                >
                  editor
                </a>
                {" "}— в навбаре загорится зелёный StatusDot.
              </p>
            </div>
          </div>
        </div>

        {/* Native apps */}
        <Section label="// roadmap" title="Native apps · soon">
          <p className="text-[12px] mb-5 leading-[1.7]" style={{ color: "var(--muted)" }}>
            Tauri-клиент с GUI для macOS, Windows, Linux. Не нужен Node.js —
            просто .dmg / .exe / .AppImage и токен.
          </p>
          <div
            className="grid grid-cols-3 gap-px"
            style={{
              background: "var(--line-strong)",
              border: "1px solid var(--line-strong)",
            }}
          >
            {[
              { os: "macOS", icon: "⌘" },
              { os: "Windows", icon: "⊞" },
              { os: "Linux", icon: "⏻" },
            ].map((p) => (
              <div
                key={p.os}
                className="p-6 text-center opacity-50"
                style={{ background: "var(--bg)" }}
              >
                <div
                  className="nit-display text-[28px] mb-2"
                  style={{ color: "var(--muted)" }}
                >
                  {p.icon}
                </div>
                <div className="text-[10px] tracking-[0.15em] uppercase" style={{ color: "var(--muted)" }}>
                  {p.os}
                </div>
                <div
                  className="text-[9px] tracking-[0.1em] mt-1"
                  style={{ color: "var(--muted-2)" }}
                >
                  // soon
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* System requirements */}
        <Section label="// system requirements" title="Hardware">
          <ul className="space-y-2.5 text-[12px] font-mono" style={{ color: "var(--muted)" }}>
            <li>
              <Mono color="accent">GPU:</Mono> 6+ GB VRAM для 7B модели,
              4 GB для 3B. CPU fallback работает но медленно.
            </li>
            <li>
              <Mono color="accent">Disk:</Mono> 5–15 GB на модель + 200 MB на CLI.
            </li>
            <li>
              <Mono color="accent">Network:</Mono> стабильный канал для
              WebSocket (туннель — persistent connection).
            </li>
            <li>
              <Mono color="accent">OS:</Mono> macOS 11+, Windows 10+, любой
              современный Linux.
            </li>
          </ul>
        </Section>

        <div className="text-center mt-16">
          <NitButton href="/" variant="ghost">
            ← Back to editor
          </NitButton>
        </div>
      </main>

      <footer
        className="relative z-10 py-10 text-center text-[10px] tracking-[0.15em] uppercase"
        style={{ borderTop: "1px solid var(--line)", color: "var(--muted-2)" }}
      >
        NITGEN · MIT · OPEN SOURCE ·{" "}
        <a
          href="https://github.com/igor1000rr/nit-builder"
          target="_blank"
          rel="noopener"
          className="no-underline transition hover:text-[color:var(--accent-glow)]"
          style={{ color: "var(--muted)" }}
        >
          GITHUB
        </a>
      </footer>
    </div>
  );
}

/* ─── Helper sub-components ───────────────────────────── */

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-12">
      <div
        className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-3"
        style={{ color: "var(--accent-glow)" }}
      >
        <span className="w-10 h-px" style={{ background: "var(--accent-glow)" }} />
        {label}
      </div>
      <h2 className="nit-display text-[28px] mb-5">{title}</h2>
      <div
        className="p-6"
        style={{
          background: "rgba(10,13,24,0.6)",
          border: "1px solid var(--line)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start gap-5 mb-4">
        <div
          className="shrink-0 nit-display text-[36px] leading-none"
          style={{ color: "var(--accent-glow)" }}
        >
          {n}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="nit-display text-[20px] mb-3">{title}</h3>
          {children}
        </div>
      </div>
    </div>
  );
}

function Req({
  k,
  link,
  extra,
}: {
  k: string;
  link: { href: string; text: string };
  extra?: string;
}) {
  return (
    <li className="flex items-start gap-3" style={{ color: "var(--muted)" }}>
      <span style={{ color: "var(--accent-glow)" }}>→</span>
      <span>
        <span style={{ color: "var(--ink)" }}>{k}</span> ·{" "}
        <a
          href={link.href}
          target={link.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener"
          className="no-underline transition"
          style={{ color: "var(--accent-glow)" }}
        >
          {link.text}
        </a>
        {extra && <span> · {extra}</span>}
      </span>
    </li>
  );
}

function Mono({
  children,
  color = "ink",
}: {
  children: React.ReactNode;
  color?: "ink" | "accent" | "acid";
}) {
  const c = {
    ink: "var(--ink)",
    accent: "var(--accent-glow)",
    acid: "var(--acid)",
  }[color];
  return (
    <span
      className="font-mono px-1.5 py-0.5 text-[11px]"
      style={{
        color: c,
        background: "rgba(0,212,255,0.06)",
        border: "1px solid var(--line)",
      }}
    >
      {children}
    </span>
  );
}

function CodeBlock({
  code,
  copyKey,
  copied,
  onCopy,
}: {
  code: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="relative">
      <pre
        className="p-5 text-[11px] font-mono overflow-x-auto leading-[1.7]"
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid var(--line-strong)",
          color: "var(--ink-dim)",
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => onCopy(code, copyKey)}
        className="absolute top-3 right-3 px-3 py-1.5 text-[10px] font-bold tracking-[0.15em] uppercase text-black transition"
        style={{
          background: copied === copyKey ? "var(--acid)" : "var(--accent)",
        }}
      >
        {copied === copyKey ? "✓ COPIED" : "COPY"}
      </button>
    </div>
  );
}
