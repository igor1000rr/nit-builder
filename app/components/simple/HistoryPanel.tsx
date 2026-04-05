import { useEffect, useState } from "react";
import { loadHistory, deleteFromHistory, type HistoryEntry } from "~/lib/stores/historyStore";

type Props = {
  onOpen: (entry: HistoryEntry) => void;
  onClose: () => void;
  isOpen: boolean;
};

export function HistoryPanel({ onOpen, onClose, isOpen }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (isOpen) setEntries(loadHistory());
  }, [isOpen]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteFromHistory(id);
    setEntries(updated);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-end p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Мои сайты</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {entries.length === 0 ? "пусто" : `${entries.length} из 20`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4 opacity-20">📄</div>
              <p className="text-slate-500 text-sm">Сайтов пока нет</p>
              <p className="text-slate-600 text-xs mt-2">Созданные сайты будут сохраняться здесь автоматически</p>
            </div>
          )}

          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry)}
              className="w-full text-left p-4 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl transition group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium line-clamp-1">{entry.prompt}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {entry.templateName} · {formatDate(entry.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(entry.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  aria-label="Удалить"
                >
                  🗑
                </button>
              </div>
            </button>
          ))}
        </div>

        {entries.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              История хранится только в этом браузере
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  const day = 24 * 60 * 60 * 1000;

  if (diff < 60 * 1000) return "только что";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин назад`;
  if (diff < day) return `${Math.floor(diff / (60 * 60 * 1000))} ч назад`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} дн назад`;

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
