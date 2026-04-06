import { useState } from "react";

type Props = {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  initialValue?: string;
};

const EXAMPLES = [
  "Сайт для кофейни в центре Минска",
  "Портфолио фотографа-путешественника",
  "Лендинг курса по английскому для детей",
  "Страница для свадьбы в стиле минимализм",
];

export function SimplePromptInput({ onSubmit, loading, initialValue = "" }: Props) {
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-3"
        style={{ color: "var(--accent-glow)" }}
      >
        <span className="w-10 h-px" style={{ background: "var(--accent-glow)" }} />
        // prompt input
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Опиши свой сайт одним-двумя предложениями..."
          rows={5}
          disabled={loading}
          className="w-full px-6 py-5 pr-6 pb-20 text-[16px] font-mono resize-none outline-none disabled:opacity-50 transition-all"
          style={{
            background: "rgba(10,13,24,0.6)",
            border: focused ? "1px solid var(--accent)" : "1px solid var(--line-strong)",
            color: "var(--ink)",
            boxShadow: focused
              ? "0 0 40px rgba(0,212,255,0.15), inset 0 0 0 1px var(--accent)"
              : "none",
            backdropFilter: "blur(10px)",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !value.trim()}
          className="absolute bottom-5 right-5 px-6 py-3 text-[12px] font-bold tracking-[0.15em] uppercase text-black transition flex items-center gap-2 disabled:opacity-30"
          style={{
            background: "var(--accent)",
            boxShadow: "var(--glow-cyan-sm)",
          }}
        >
          {loading ? (
            <>
              <span
                className="w-3 h-3 rounded-full animate-spin"
                style={{
                  border: "2px solid rgba(0,0,0,0.3)",
                  borderTopColor: "#000",
                }}
              />
              Generating...
            </>
          ) : (
            <>
              Generate <span className="text-[14px]">⌘↵</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="px-4 py-2 text-[11px] font-mono transition"
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--acid)";
              e.currentTarget.style.color = "var(--acid)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line)";
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            → {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
