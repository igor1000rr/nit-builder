import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; text: string };

type Props = {
  onPolish: (request: string) => void;
  messages: Message[];
  loading: boolean;
};

export function PolishChat({ onPolish, messages, loading }: Props) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onPolish(trimmed);
    setValue("");
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="font-semibold text-white">💬 Правки</h3>
        <p className="text-xs text-slate-500 mt-1">Опиши что изменить — AI доработает</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Попробуй:</p>
            {[
              "Сделай кнопки ярче",
              "Добавь секцию с отзывами",
              "Поменяй цвет на фиолетовый",
              "Сделай заголовок больше",
              "Убери секцию с ценами",
            ].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="block w-full text-left px-4 py-3 text-sm text-slate-400 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/50 hover:text-white transition"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                m.role === "user"
                  ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white"
                  : "bg-slate-900 text-slate-300 border border-slate-800"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0.1s" }} />
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Что изменить?"
            disabled={loading}
            className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !value.trim()}
            className="px-5 py-3 bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-xl font-medium disabled:opacity-40 hover:scale-105 transition"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
