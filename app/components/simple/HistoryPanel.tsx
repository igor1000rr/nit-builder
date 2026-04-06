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
      className="fixed inset-0 z-[90] backdrop-blur-sm flex items-start justify-end p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-hidden flex flex-col"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line-strong)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-1"
              style={{ color: "var(--accent-glow)" }}
            >
              // history
            </div>
            <h3 className="nit-display text-[20px]" style={{ color: "var(--ink)" }}>
              YOUR SITES
            </h3>
            <p
              className="text-[10px] tracking-[0.1em] uppercase mt-1"
              style={{ color: "var(--muted-2)" }}
            >
              {source === "loading"
                ? "loading..."
                : entries.length === 0
                  ? "empty"
                  : `${entries.length} · ${source === "remote" ? "synced" : "local only"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 transition flex items-center justify-center"
            style={{
              border: "1px solid var(--line-strong)",
              color: "var(--muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--magenta)";
              e.currentTarget.style.color = "var(--magenta)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line-strong)";
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {source === "loading" && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="p-4 animate-pulse"
                  style={{
                    background: "rgba(10,13,24,0.6)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    className="h-3 w-3/4 mb-3"
                    style={{ background: "var(--line-strong)" }}
                  />
                  <div
                    className="h-2 w-1/2"
                    style={{ background: "var(--line)" }}
                  />
                </div>
              ))}
            </div>
          )}

          {source !== "loading" && entries.length === 0 && (
            <div className="text-center py-20">
              <div
                className="text-[10px] tracking-[0.2em] uppercase mb-3"
                style={{ color: "var(--muted-2)" }}
              >
                // null
              </div>
              <p
                className="nit-display text-[24px] mb-3"
                style={{ color: "var(--muted)" }}
              >
                NO SITES YET
              </p>
              <p
                className="text-[11px] tracking-[0.05em] max-w-[260px] mx-auto"
                style={{ color: "var(--muted-2)" }}
              >
                {source === "remote"
                  ? "Generated sites will sync to your account"
                  : "Sign in to sync between devices"}
              </p>
            </div>
          )}

          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={loadingEntry === entry.id}
              onClick={() => handleOpen(entry.id, entry.source)}
              className="w-full text-left p-4 transition group disabled:opacity-50"
              style={{
                background: "rgba(10,13,24,0.6)",
                border: "1px solid var(--line)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.background = "rgba(0,212,255,0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.background = "rgba(10,13,24,0.6)";
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-mono line-clamp-2 leading-snug"
                    style={{ color: "var(--ink)" }}
                  >
                    {entry.prompt}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase px-1.5 py-0.5"
                      style={{
                        color: "var(--accent-glow)",
                        border: "1px solid var(--line-strong)",
                      }}
                    >
                      {entry.templateName}
                    </span>
                    <span
                      className="text-[10px] tracking-[0.05em]"
                      style={{ color: "var(--muted-2)" }}
                    >
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(entry.id, entry.source, e)}
                  className="opacity-0 group-hover:opacity-100 transition text-[14px]"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--magenta)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--muted)";
                  }}
                  aria-label="Delete"
                >
                  ✕
                </button>
              </div>
            </button>
          ))}
        </div>

        {entries.length > 0 && source === "local" && (
          <div
            className="px-5 py-4"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <p
              className="text-[10px] tracking-[0.1em] uppercase text-center"
              style={{ color: "var(--muted-2)" }}
            >
              Local browser only ·{" "}
              <a
                href="/register"
                className="no-underline transition"
                style={{ color: "var(--accent-glow)" }}
              >
                register →
              </a>
            </p>
          </div>
        )}

        {entries.length > 0 && source === "remote" && (
          <div
            className="px-5 py-4"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <p
              className="text-[10px] tracking-[0.1em] uppercase text-center"
              style={{ color: "var(--muted-2)" }}
            >
              ✓ synced with your account
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
