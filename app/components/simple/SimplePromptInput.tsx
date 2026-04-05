import { useState } from "react";

type Props = {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  initialValue?: string;
};

const EXAMPLES = [
  "Сайт для кофейни в центре Минска",
  "Портфолио фотографа-путешественника",
  "Страница для моей жены, она делает торты",
  "Лендинг курса по английскому для детей",
];

export function SimplePromptInput({ onSubmit, loading, initialValue = "" }: Props) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Опиши свой сайт одним-двумя предложениями..."
          rows={4}
          disabled={loading}
          className="w-full px-6 py-5 bg-slate-900/70 border-2 border-slate-800 rounded-3xl text-white placeholder-slate-500 text-lg resize-none focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !value.trim()}
          className="absolute bottom-5 right-5 px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-2xl font-semibold hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Создаём...
            </>
          ) : (
            <>Создать ⌘↵</>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="px-4 py-2 text-xs text-slate-400 bg-slate-900/50 border border-slate-800 rounded-full hover:border-blue-500/50 hover:text-white transition"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
