import { useEffect, useState } from "react";
import {
  loadHistory,
  deleteFromHistory,
  type HistoryEntry,
} from "~/lib/stores/historyStore";
import {
  listRemoteSites,
  getRemoteSite,
  deleteRemoteSite,
  migrateLocalHistoryIfNeeded,
} from "~/lib/stores/remoteHistoryStore";
import { useAuth } from "~/lib/hooks/useAuth";
import { toast } from "~/lib/stores/toastStore";

type Props = {
  onOpen: (entry: HistoryEntry) => void;
  onClose: () => void;
  isOpen: boolean;
};

type Source = "local" | "remote" | "loading";

type DisplayEntry = {
  id: string;
  prompt: string;
  templateName: string;
  createdAt: number;
  source: "local" | "remote";
};

export function HistoryPanel({ onOpen, onClose, isOpen }: Props) {
  const auth = useAuth();
  const [source, setSource] = useState<Source>("loading");
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [loadingEntry, setLoadingEntry] = useState<string | null>(null);

  // Clear entries immediately when auth status changes (logout/login)
  // to prevent showing previous user's data while new fetch loads
  useEffect(() => {
    setEntries([]);
    setSource("loading");
  }, [auth.status]);

  useEffect(() => {
    if (!isOpen) return;

    if (auth.status === "loading") {
      setSource("loading");
      return;
    }

    if (auth.status === "authenticated") {
      setSource("remote");
      void (async () => {
        try {
          const migrated = await migrateLocalHistoryIfNeeded();
          if (migrated > 0) {
            toast.info(`Перенесено ${migrated} сайтов в облако`);
          }
          const remote = await listRemoteSites();
          setEntries(
            remote.map((s) => ({
              id: s.id,
              prompt: s.prompt,
              templateName: s.templateName,
              createdAt: new Date(s.createdAt).getTime(),
              source: "remote" as const,
            })),
          );
        } catch {
          toast.error("Не удалось загрузить сайты");
          setEntries([]);
        }
      })();
    } else {
      setSource("local");
      const local = loadHistory();
      setEntries(
        local.map((e) => ({
          id: e.id,
          prompt: e.prompt,
          templateName: e.templateName,
          createdAt: e.createdAt,
          source: "local" as const,
        })),
      );
    }
  }, [isOpen, auth.status]);

  async function handleDelete(
    id: string,
    entrySource: "local" | "remote",
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (entrySource === "local") {
      deleteFromHistory(id);
      setEntries((prev) => prev.filter((x) => x.id !== id));
    } else {
      const ok = await deleteRemoteSite(id);
      if (ok) {
        setEntries((prev) => prev.filter((x) => x.id !== id));
        toast.success("Сайт удалён");
      } else {
        toast.error("Не удалось удалить");
      }
    }
  }

  async function handleOpen(id: string, entrySource: "local" | "remote") {
    setLoadingEntry(id);
    try {
      let entry: HistoryEntry | null = null;
      if (entrySource === "local") {
        const local = loadHistory();
        entry = local.find((e) => e.id === id) ?? null;
      } else {
        entry = await getRemoteSite(id);
      }
      if (entry) {
        onOpen(entry);
      } else {
        toast.error("Сайт не найден");
      }
    } finally {
      setLoadingEntry(null);
    }
  }

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
              {source === "loading"
                ? "загружаем..."
                : entries.length === 0
                  ? "пусто"
                  : `${entries.length} ${source === "remote" ? "· синхронизировано" : "· локально"}`}
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
          {source === "loading" && (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl"
                >
                  <div className="h-3 bg-slate-800 rounded w-3/4 mb-3" />
                  <div className="h-2 bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {source !== "loading" && entries.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4 opacity-20">📄</div>
              <p className="text-slate-500 text-sm">Сайтов пока нет</p>
              <p className="text-slate-600 text-xs mt-2">
                {source === "remote"
                  ? "Созданные сайты будут сохраняться в твой аккаунт"
                  : "Войди в аккаунт чтобы сохранять между устройствами"}
              </p>
            </div>
          )}

          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={loadingEntry === entry.id}
              onClick={() => handleOpen(entry.id, entry.source)}
              className="w-full text-left p-4 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl transition group disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium line-clamp-1">
                    {entry.prompt}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {entry.templateName} · {formatDate(entry.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(entry.id, entry.source, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  aria-label="Удалить"
                >
                  🗑
                </button>
              </div>
            </button>
          ))}
        </div>

        {entries.length > 0 && source === "local" && (
          <div className="px-5 py-3 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              История только в этом браузере ·{" "}
              <a href="/register" className="text-blue-400 hover:text-blue-300">
                зарегистрируйся
              </a>{" "}
              чтобы сохранять в облако
            </p>
          </div>
        )}

        {entries.length > 0 && source === "remote" && (
          <div className="px-5 py-3 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              Синхронизировано с твоим аккаунтом
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
