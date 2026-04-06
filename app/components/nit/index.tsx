/**
 * NIT design-system primitives.
 *
 * Все компоненты работают на CSS-переменных из app.css. Не использовать
 * tailwind-цвета типа slate-* / blue-* в новом коде — только через токены
 * (--accent, --magenta, --acid, --ink, --muted).
 *
 * Экспортируется 10 штук:
 *   GridBg, Orbs, RevealOnScroll,
 *   NitButton, Card, SectionLabel, GlitchHeading, Chip, StatusDot, Marquee
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ─── Ambient layers ─────────────────────────────────────────── */

export function GridBg() {
  return <div className="nit-grid-bg" aria-hidden />;
}

export function Orbs({ variant = "full" }: { variant?: "full" | "lite" }) {
  return (
    <>
      <div className="nit-orb nit-orb-1" aria-hidden />
      <div className="nit-orb nit-orb-2" aria-hidden />
      {variant === "full" && <div className="nit-orb nit-orb-3" aria-hidden />}
    </>
  );
}

/* ─── Reveal on scroll ───────────────────────────────────────── */

export function RevealOnScroll({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "header" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setTimeout(() => el.classList.add("in"), delay);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  const Comp = Tag as "div";
  return (
    <Comp ref={ref as never} className={`nit-reveal ${className}`}>
      {children}
    </Comp>
  );
}

/* ─── Button ─────────────────────────────────────────────────── */

type NitButtonVariant = "primary" | "ghost" | "destructive" | "acid";

export function NitButton({
  variant = "primary",
  children,
  className = "",
  as,
  href,
  onClick,
  disabled,
  type = "button",
  target,
  rel,
  title,
}: {
  variant?: NitButtonVariant;
  children: ReactNode;
  className?: string;
  as?: "a" | "button";
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: "button" | "submit";
  target?: string;
  rel?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-8 py-4 font-mono font-bold text-[13px] tracking-[0.15em] uppercase cursor-pointer transition-all duration-300 border no-underline select-none whitespace-nowrap";

  const variants: Record<NitButtonVariant, { style: CSSProperties; cls: string }> = {
    primary: {
      cls: "text-black hover:-translate-x-[2px] hover:-translate-y-[2px]",
      style: {
        background: "var(--accent)",
        borderColor: "var(--accent)",
        boxShadow: "0 0 0 1px var(--accent), 0 0 40px rgba(0,212,255,.4)",
      },
    },
    ghost: {
      cls: "text-[color:var(--ink)] hover:text-[color:var(--magenta)]",
      style: {
        background: "transparent",
        borderColor: "var(--line-strong)",
      },
    },
    destructive: {
      cls: "text-[color:var(--magenta)] hover:text-white",
      style: {
        background: "transparent",
        borderColor: "var(--magenta)",
      },
    },
    acid: {
      cls: "text-black",
      style: {
        background: "var(--acid)",
        borderColor: "var(--acid)",
        boxShadow: "var(--glow-acid)",
      },
    },
  };

  const v = variants[variant];
  const computedClass = `${base} ${v.cls} ${className} disabled:opacity-40 disabled:cursor-not-allowed`;

  if (as === "a" || (as === undefined && href)) {
    return (
      <a
        href={href}
        className={computedClass}
        style={v.style}
        onClick={onClick}
        target={target}
        rel={rel}
        title={title}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={computedClass}
      style={v.style}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/* ─── Card ───────────────────────────────────────────────────── */

export function Card({
  children,
  glow,
  className = "",
  hoverable = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  glow?: "cyan" | "magenta" | "acid" | "violet";
  className?: string;
  hoverable?: boolean;
  as?: "div" | "article" | "section";
}) {
  const glowStyle: CSSProperties = glow
    ? {
        boxShadow:
          glow === "cyan"
            ? "var(--glow-cyan-sm)"
            : glow === "magenta"
              ? "var(--glow-mag)"
              : glow === "acid"
                ? "var(--glow-acid)"
                : "var(--glow-violet)",
      }
    : {};
  const Comp = Tag as "div";
  return (
    <Comp
      className={`relative border bg-[color:var(--bg-glass)] backdrop-blur-[10px] ${
        hoverable ? "transition-all duration-300 hover:-translate-y-[4px]" : ""
      } ${className}`}
      style={{ borderColor: "var(--line)", ...glowStyle }}
    >
      {children}
    </Comp>
  );
}

/* ─── SectionLabel ───────────────────────────────────────────── */

export function SectionLabel({ number, children }: { number?: string; children: ReactNode }) {
  return (
    <div className="nit-label flex items-center gap-3 mb-4">
      <span className="w-10 h-px bg-[color:var(--accent-glow)]" />
      {number && <span>{number} ·</span>}
      <span>{children}</span>
    </div>
  );
}

/* ─── GlitchHeading ──────────────────────────────────────────── */

export function GlitchHeading({
  lines,
  className = "",
}: {
  /** Каждая строка: либо обычный текст, либо [text, 'glitch'] для glitch-эффекта */
  lines: Array<string | [string, "glitch"]>;
  className?: string;
}) {
  return (
    <h1
      className={`nit-display text-[clamp(48px,8vw,128px)] leading-[0.85] tracking-[-0.04em] mb-8 ${className}`}
    >
      {lines.map((line, i) => {
        if (Array.isArray(line)) {
          return (
            <span
              key={i}
              className="nit-glitch block"
              data-text={line[0]}
              style={{
                fontSize: "inherit",
                fontWeight: 900,
                lineHeight: 0.85,
                letterSpacing: "-0.04em",
              }}
            >
              {line[0]}
            </span>
          );
        }
        return (
          <span key={i} className="block text-[color:var(--ink)]">
            {line}
          </span>
        );
      })}
    </h1>
  );
}

/* ─── Chip ───────────────────────────────────────────────────── */

export function Chip({
  children,
  color = "accent",
}: {
  children: ReactNode;
  color?: "accent" | "acid" | "magenta" | "muted";
}) {
  const colors = {
    accent: { c: "var(--accent-glow)", bg: "rgba(0,212,255,0.05)" },
    acid: { c: "var(--acid)", bg: "rgba(212,255,0,0.05)" },
    magenta: { c: "var(--magenta)", bg: "rgba(255,46,147,0.05)" },
    muted: { c: "var(--muted)", bg: "transparent" },
  };
  const v = colors[color];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 text-[10px] font-mono font-bold tracking-[0.15em] uppercase border whitespace-nowrap"
      style={{ color: v.c, borderColor: v.c, background: v.bg }}
    >
      {children}
    </span>
  );
}

/* ─── StatusDot ──────────────────────────────────────────────── */

export function StatusDot({
  status,
  label,
  className = "",
}: {
  status: "online" | "offline" | "streaming" | "loading" | "error";
  label?: string;
  className?: string;
}) {
  const cfg = {
    online: { c: "var(--acid)", bg: "rgba(212,255,0,0.08)", anim: true, text: "ONLINE" },
    offline: { c: "var(--muted)", bg: "transparent", anim: false, text: "OFFLINE" },
    streaming: { c: "var(--accent-glow)", bg: "rgba(0,212,255,0.08)", anim: true, text: "STREAMING" },
    loading: { c: "var(--violet-glow)", bg: "rgba(157,77,255,0.08)", anim: true, text: "LOADING" },
    error: { c: "var(--magenta)", bg: "rgba(255,46,147,0.08)", anim: false, text: "ERROR" },
  };
  const v = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-mono font-bold tracking-[0.15em] uppercase border ${className}`}
      style={{ color: v.c, borderColor: v.c, background: v.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: v.c,
          boxShadow: v.anim ? `0 0 10px ${v.c}` : undefined,
          animation: v.anim ? "nit-pulse 2s infinite" : undefined,
        }}
      />
      {label ?? v.text}
    </span>
  );
}

/* ─── Marquee ────────────────────────────────────────────────── */

export function Marquee({ items }: { items: Array<{ text: string; variant?: "fill" | "outline" | "star" }> }) {
  // Дублируем для бесшовной прокрутки
  const all = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden border-y py-5 whitespace-nowrap"
      style={{
        borderColor: "var(--line)",
        background: "rgba(0,212,255,0.03)",
      }}
    >
      <div
        className="inline-block"
        style={{
          animation: "nit-marquee 30s linear infinite",
          fontFamily: "var(--display)",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {all.map((it, i) => {
          const variant = it.variant ?? "fill";
          const style: CSSProperties =
            variant === "fill"
              ? { color: "var(--ink)" }
              : variant === "outline"
                ? { color: "transparent", WebkitTextStroke: "1px var(--accent-glow)" }
                : { color: "var(--magenta)" };
          return (
            <span key={i} className="mx-8" style={style}>
              {it.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Hook для reveal-менеджмента (опционально) ──────────────── */

export function useRevealTrigger() {
  const [triggered, setTriggered] = useState(false);
  useEffect(() => setTriggered(true), []);
  return triggered;
}
