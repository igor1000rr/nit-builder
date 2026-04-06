import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; text: string };

type Props = {
  onPolish: (request: string) => void;
  messages: Message[];
  loading: boolean;
  loadingLabel?: string;
};

const SUGGESTIONS = [
  "Сделай кнопки ярче",
  "Добавь секцию с отзывами",
  "Поменяй цвет на фиолетовый",
  "Сделай заголовок больше",
  "Убери секцию с ценами",
];

export function PolishChat({ onPolish, messages, loading, loadingLabel }: Props) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onPolish(trimmed);
    setValue("");
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg)",
        borderRight: "1px solid var(--line)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div
          className="text-[10px] tracking-[0.2em] uppercase mb-1"
          style={{ color: "var(--accent-glow)" }}
        >
          // chat · ai polish
        </div>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Опиши правки — увидишь результат справа
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="space-y-2.5">
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-3"
              style={{ color: "var(--muted-2)" }}
            >
              // try
            </div>
            {SUGGESTIONS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="block w-full text-left px-4 py-3 text-[12px] transition group"
                style={{
                  background: "transparent",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--ink)";
                  e.currentTarget.style.background = "rgba(0,212,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.color = "var(--muted)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ color: "var(--accent-glow)" }}>→ </span>
                {ex}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[88%] px-4 py-3 text-[12px] whitespace-pre-wrap font-mono"
                style={{
                  background: isUser
                    ? "rgba(0,212,255,0.06)"
                    : "rgba(157,77,255,0.04)",
                  borderLeft: isUser
                    ? "2px solid var(--accent)"
                    : "2px solid var(--violet)",
                  color: isUser ? "var(--ink)" : "var(--ink-dim)",
                }}
              >
                <div
                  className="text-[9px] tracking-[0.2em] uppercase mb-1.5 opacity-60"
                  style={{ color: isUser ? "var(--accent-glow)" : "var(--violet-glow)" }}
                >
                  {isUser ? "// you" : "// ai"}
                </div>
                {m.text}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{
                background: "rgba(157,77,255,0.04)",
                borderLeft: "2px solid var(--violet)",
              }}
            >
              <div className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "var(--violet-glow)",
                    animation: "nit-pulse 1.4s infinite",
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "var(--violet-glow)",
                    animation: "nit-pulse 1.4s infinite",
                    animationDelay: "0.2s",
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "var(--violet-glow)",
                    animation: "nit-pulse 1.4s infinite",
                    animationDelay: "0.4s",
                  }}
                />
              </div>
              {loadingLabel && (
                <span
                  className="text-[10px] tracking-[0.1em] uppercase"
                  style={{ color: "var(--violet-glow)" }}
                >
                  {loadingLabel}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="p-4 shrink-0"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={loading ? "// ai working..." : "// what to change?"}
            disabled={loading}
            className="flex-1 px-4 py-3 text-[12px] font-mono outline-none disabled:opacity-50 transition"
            style={{
              background: "transparent",
              border: "1px solid var(--line-strong)",
              color: "var(--ink)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 15px rgba(0,212,255,0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--line-strong)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !value.trim()}
            className="px-4 py-3 text-[14px] font-bold text-black transition disabled:opacity-30"
            style={{
              background: "var(--accent)",
              boxShadow: "var(--glow-cyan-sm)",
            }}
            title="Send (Enter)"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
