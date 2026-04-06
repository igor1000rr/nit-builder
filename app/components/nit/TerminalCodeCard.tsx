/**
 * TerminalCodeCard — hero visual для landing.
 *
 * Имитирует terminal/editor окно где AI печатает HTML символ за символом.
 * 3D-tilt + window chrome + syntax-highlighted typewriter + live stats bar.
 *
 * Используется ВМЕСТО старой TunnelCard. Гораздо больше отражает
 * что делает продукт — буквально показывает live-генерацию кода.
 */

import { useEffect, useState, useRef } from "react";

const SCRIPT: Array<{ text: string; cls?: string }> = [
  { text: "<!DOCTYPE html>\n", cls: "tag" },
  { text: "<html ", cls: "tag" },
  { text: "lang", cls: "attr" },
  { text: "=", cls: "punct" },
  { text: '"ru"', cls: "str" },
  { text: ">\n", cls: "tag" },
  { text: "<head>\n", cls: "tag" },
  { text: "  <title>", cls: "tag" },
  { text: "Coffee Shop", cls: "text" },
  { text: "</title>\n", cls: "tag" },
  { text: "  <script ", cls: "tag" },
  { text: "src", cls: "attr" },
  { text: "=", cls: "punct" },
  { text: '"https://cdn.tailwindcss.com"', cls: "str" },
  { text: "></script>\n", cls: "tag" },
  { text: "</head>\n", cls: "tag" },
  { text: "<body ", cls: "tag" },
  { text: "class", cls: "attr" },
  { text: "=", cls: "punct" },
  { text: '"bg-amber-50"', cls: "str" },
  { text: ">\n", cls: "tag" },
  { text: "  <h1>", cls: "tag" },
  { text: "Brewed in Minsk", cls: "text" },
  { text: "</h1>\n", cls: "tag" },
  { text: "</body>\n", cls: "tag" },
  { text: "</html>", cls: "tag" },
];

const FULL_TEXT = SCRIPT.reduce((sum, s) => sum + s.text.length, 0);
const TYPE_SPEED_MS = 22;
const PAUSE_MS = 2500;

export function TerminalCodeCard() {
  const [chars, setChars] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (!mounted) return;
      setChars((c) => {
        if (c >= FULL_TEXT) {
          pauseTimer = setTimeout(() => {
            if (mounted) setChars(0);
          }, PAUSE_MS);
          return c;
        }
        return c + 1;
      });
      tickRef.current = window.setTimeout(tick, TYPE_SPEED_MS);
    };

    tick();
    return () => {
      mounted = false;
      if (tickRef.current) clearTimeout(tickRef.current);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, []);

  // Render the script up to `chars` characters
  const rendered: Array<{ text: string; cls?: string; key: number }> = [];
  let remaining = chars;
  for (let i = 0; i < SCRIPT.length; i++) {
    const seg = SCRIPT[i]!;
    if (remaining <= 0) break;
    if (remaining >= seg.text.length) {
      rendered.push({ text: seg.text, cls: seg.cls, key: i });
      remaining -= seg.text.length;
    } else {
      rendered.push({ text: seg.text.slice(0, remaining), cls: seg.cls, key: i });
      remaining = 0;
    }
  }

  const colorMap: Record<string, string> = {
    tag: "var(--accent-glow)",
    attr: "var(--acid)",
    punct: "var(--muted)",
    str: "var(--magenta-glow)",
    text: "var(--ink)",
  };

  // tokens/sec calculation — fake but plausible
  const charsPerSec = 1000 / TYPE_SPEED_MS;
  const tokensPerSec = Math.round(charsPerSec * 0.25); // ~4 chars per token
  const progress = Math.round((chars / FULL_TEXT) * 100);

  return (
    <div
      className="relative flex justify-center items-center w-full"
      style={{ perspective: 1400 }}
    >
      {/* orbital ring */}
      <div
        className="absolute w-[115%] h-[115%] pointer-events-none"
        style={{
          border: "1px dashed var(--line-strong)",
          borderRadius: "50%",
          animation: "nit-spin 30s linear infinite",
        }}
      >
        <span
          className="absolute -top-1.5 left-1/2 w-3 h-3 rounded-full"
          style={{
            background: "var(--magenta)",
            boxShadow:
              "0 0 12px var(--magenta), 0 0 24px var(--magenta), 0 0 36px var(--magenta)",
            transform: "translateX(-50%)",
          }}
        />
        <span
          className="absolute top-1/2 -right-1.5 w-2 h-2 rounded-full"
          style={{
            background: "var(--acid)",
            boxShadow: "0 0 10px var(--acid), 0 0 20px var(--acid)",
            transform: "translateY(-50%)",
          }}
        />
      </div>

      {/* the card itself */}
      <div
        className="relative w-[440px] max-w-full"
        style={{
          transformStyle: "preserve-3d",
          animation: "nit-tilt 9s ease-in-out infinite",
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #0a0d18 0%, #0d1628 50%, #1a0d28 100%)",
            border: "1px solid var(--line-strong)",
            boxShadow:
              "0 30px 80px rgba(0,212,255,.3), 0 0 0 1px rgba(92,233,255,.15), inset 0 1px 0 rgba(255,255,255,.06), 0 0 60px rgba(0,212,255,0.2)",
          }}
        >
          {/* corner glows */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 0%, rgba(92,233,255,.3), transparent 50%), radial-gradient(circle at 80% 100%, rgba(255,46,147,.25), transparent 50%)",
            }}
          />
          {/* diagonal hatch */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(45deg, transparent 0, transparent 40px, rgba(92,233,255,.04) 40px, rgba(92,233,255,.04) 41px)",
            }}
          />

          {/* window chrome / title bar */}
          <div
            className="relative flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom: "1px solid var(--line)",
              background: "rgba(0,0,0,0.3)",
            }}
          >
            {/* 3 dots */}
            <div className="flex gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "var(--magenta)", boxShadow: "0 0 6px var(--magenta)" }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "var(--acid)", boxShadow: "0 0 6px var(--acid)" }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "var(--accent-glow)", boxShadow: "0 0 6px var(--accent)" }}
              />
            </div>
            <div
              className="flex-1 text-center text-[10px] tracking-[0.15em] uppercase font-mono"
              style={{ color: "var(--muted)" }}
            >
              ~/coffee-shop/index.html
            </div>
            <div
              className="text-[9px] font-bold tracking-[0.15em] px-1.5 py-0.5"
              style={{
                color: "var(--acid)",
                border: "1px solid var(--acid)",
                animation: "nit-pulse 1.6s infinite",
              }}
            >
              ● LIVE
            </div>
          </div>

          {/* code area */}
          <div
            className="relative px-5 py-4 font-mono text-[11px] leading-[1.65] overflow-hidden"
            style={{
              minHeight: 280,
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <pre className="whitespace-pre-wrap break-words m-0">
              {rendered.map((seg) => (
                <span
                  key={seg.key}
                  style={{ color: seg.cls ? colorMap[seg.cls] : "var(--ink)" }}
                >
                  {seg.text}
                </span>
              ))}
              <span
                className="inline-block w-[8px] h-[14px] align-middle ml-0.5"
                style={{
                  background: "var(--accent-glow)",
                  boxShadow: "0 0 8px var(--accent)",
                  animation: "nit-cursor 1s steps(2) infinite",
                }}
              />
            </pre>
          </div>

          {/* status bar */}
          <div
            className="relative flex items-center justify-between px-4 py-2.5 text-[10px] tracking-[0.1em] uppercase font-mono"
            style={{
              borderTop: "1px solid var(--line)",
              background: "rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "var(--accent-glow)",
                  boxShadow: "0 0 6px var(--accent)",
                  animation: "nit-pulse 1.5s infinite",
                }}
              />
              <span style={{ color: "var(--accent-glow)" }}>STREAMING</span>
              <span style={{ color: "var(--muted-2)" }}>·</span>
              <span style={{ color: "var(--ink-dim)" }}>{tokensPerSec} t/s</span>
            </div>
            <div style={{ color: "var(--muted)" }}>QWEN-CODER 7B</div>
          </div>

          {/* progress strip */}
          <div
            className="relative h-0.5"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <div
              className="absolute inset-y-0 left-0 transition-all duration-100"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--accent), var(--magenta))",
                boxShadow: "0 0 10px var(--accent), 0 0 20px var(--accent)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
