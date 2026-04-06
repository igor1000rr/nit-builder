import { useEffect, useState } from "react";
import { useAuth, useAuthRefetch } from "~/lib/contexts/AuthContext";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: "⌘ + Enter", desc: "Создать сайт" },
  { keys: "⌘ + H", desc: "История" },
  { keys: "⌘ + D", desc: "Скачать HTML" },
  { keys: "⌘ + ,", desc: "Настройки" },
  { keys: "Esc", desc: "Закрыть / Отмена" },
];

export function SettingsDrawer({ isOpen, onClose }: Props) {
  const auth = useAuth();
  const refetchAuth = useAuthRefetch();
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Reset regenerate flow when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setShowRegenerate(false);
      setRegeneratePassword("");
      setRegenerateError(null);
      setNewToken(null);
      setCopied(false);
    }
  }, [isOpen]);

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await fetch("/api/auth/regenerate-tunnel-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: regeneratePassword }),
      });
      const data = (await res.json()) as { tunnelToken?: string; error?: string };
      if (!res.ok) {
        setRegenerateError(data.error ?? "Не удалось сгенерировать токен");
        setRegenerating(false);
        return;
      }
      setNewToken(data.tunnelToken ?? null);
      setRegeneratePassword("");
    } catch {
      setRegenerateError("Ошибка сети");
    } finally {
      setRegenerating(false);
    }
  }

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refetchAuth();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line-strong)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-1"
              style={{ color: "var(--accent-glow)" }}
            >
              // settings
            </div>
            <h2 className="nit-display text-[20px]" style={{ color: "var(--ink)" }}>
              CONFIGURATION
            </h2>
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

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Account */}
          {auth.status === "authenticated" ? (
            <div>
              <div
                className="text-[10px] tracking-[0.2em] uppercase mb-3"
                style={{ color: "var(--accent-glow)" }}
              >
                // account
              </div>
              <div
                className="p-4"
                style={{
                  background: "rgba(10,13,24,0.6)",
                  border: "1px solid var(--line)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-mono" style={{ color: "var(--ink)" }}>
                      {auth.email}
                    </div>
                    <div
                      className="text-[10px] tracking-[0.1em] uppercase mt-1.5 flex items-center gap-2"
                      style={{ color: "var(--muted)" }}
                    >
                      tunnel:
                      <span
                        className="flex items-center gap-1.5"
                        style={{
                          color:
                            auth.tunnel.status === "online"
                              ? "var(--acid)"
                              : "var(--muted)",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background:
                              auth.tunnel.status === "online"
                                ? "var(--acid)"
                                : "var(--muted)",
                            boxShadow:
                              auth.tunnel.status === "online"
                                ? "0 0 8px var(--acid)"
                                : undefined,
                            animation:
                              auth.tunnel.status === "online"
                                ? "nit-pulse 2s infinite"
                                : undefined,
                          }}
                        />
                        {auth.tunnel.status === "online"
                          ? `online · ${auth.tunnel.activeTunnels}`
                          : "offline"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-3 py-2 text-[10px] tracking-[0.15em] uppercase transition"
                    style={{
                      border: "1px solid var(--line-strong)",
                      color: "var(--magenta)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--magenta)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--line-strong)";
                    }}
                  >
                    Log out
                  </button>
                </div>
              </div>
            </div>
          ) : auth.status === "unauthenticated" ? (
            <div>
              <div
                className="text-[10px] tracking-[0.2em] uppercase mb-3"
                style={{ color: "var(--accent-glow)" }}
              >
                // account
              </div>
              <div className="flex gap-2">
                <a
                  href="/login"
                  className="flex-1 text-center px-4 py-3 text-[11px] tracking-[0.15em] uppercase no-underline transition"
                  style={{
                    border: "1px solid var(--line-strong)",
                    color: "var(--ink)",
                  }}
                >
                  Login
                </a>
                <a
                  href="/register"
                  className="flex-1 text-center px-4 py-3 text-[11px] font-bold tracking-[0.15em] uppercase no-underline text-black transition"
                  style={{ background: "var(--accent)" }}
                >
                  Register
                </a>
              </div>
            </div>
          ) : null}

          {/* Tunnel Token */}
          {auth.status === "authenticated" && (
            <div>
              <div
                className="text-[10px] tracking-[0.2em] uppercase mb-3"
                style={{ color: "var(--accent-glow)" }}
              >
                // tunnel · token
              </div>
              {newToken ? (
                <div className="space-y-3">
                  <div
                    className="p-3 text-[11px]"
                    style={{
                      border: "1px solid var(--magenta)",
                      background: "rgba(255,46,147,0.05)",
                      color: "var(--magenta-glow)",
                    }}
                  >
                    ⚠ Токен показан один раз. Скопируй сейчас.
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={newToken}
                      className="w-full px-3 py-3 pr-24 text-[11px] font-mono outline-none"
                      style={{
                        background: "rgba(0,212,255,0.04)",
                        border: "1px solid var(--accent)",
                        color: "var(--accent-glow)",
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={copyToken}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-[10px] font-bold tracking-[0.15em] uppercase transition text-black"
                      style={{ background: copied ? "var(--acid)" : "var(--accent)" }}
                    >
                      {copied ? "✓ COPIED" : "COPY"}
                    </button>
                  </div>
                </div>
              ) : showRegenerate ? (
                <div className="space-y-3">
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    Введи свой пароль. Старый токен будет отозван, все активные
                    туннели отключатся немедленно.
                  </p>
                  <input
                    type="password"
                    value={regeneratePassword}
                    onChange={(e) => setRegeneratePassword(e.target.value)}
                    placeholder="Current password"
                    autoComplete="current-password"
                    className="w-full px-3 py-3 text-[12px] font-mono outline-none transition"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--line-strong)",
                      color: "var(--ink)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--magenta)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--line-strong)";
                    }}
                  />
                  {regenerateError && (
                    <div
                      className="p-2 text-[11px]"
                      style={{
                        border: "1px solid var(--magenta)",
                        background: "rgba(255,46,147,0.05)",
                        color: "var(--magenta-glow)",
                      }}
                    >
                      ⚠ {regenerateError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRegenerate(false);
                        setRegeneratePassword("");
                        setRegenerateError(null);
                      }}
                      className="flex-1 px-3 py-2.5 text-[10px] tracking-[0.15em] uppercase transition"
                      style={{
                        border: "1px solid var(--line-strong)",
                        color: "var(--muted)",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={regenerating || regeneratePassword.length === 0}
                      className="flex-1 px-3 py-2.5 text-[10px] font-bold tracking-[0.15em] uppercase text-black transition disabled:opacity-30"
                      style={{ background: "var(--magenta)" }}
                    >
                      {regenerating ? "..." : "Regenerate"}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="p-4"
                  style={{
                    background: "rgba(10,13,24,0.6)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <p className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
                    Токен виден только при регистрации. Если потерял —
                    перегенерируй (все активные туннели отключатся).
                  </p>
                  {auth.tunnelTokenCreatedAt && (
                    <p
                      className="text-[10px] tracking-[0.05em] mb-3"
                      style={{ color: "var(--muted-2)" }}
                    >
                      Created: {new Date(auth.tunnelTokenCreatedAt).toLocaleDateString("ru")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRegenerate(true)}
                    className="text-[11px] tracking-[0.05em] transition"
                    style={{ color: "var(--magenta)" }}
                  >
                    → Regenerate token
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Keyboard shortcuts */}
          <div>
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-3"
              style={{ color: "var(--accent-glow)" }}
            >
              // shortcuts
            </div>
            <div
              className="divide-y"
              style={{
                border: "1px solid var(--line)",
                background: "rgba(10,13,24,0.4)",
              }}
            >
              {SHORTCUTS.map((sc) => (
                <div
                  key={sc.keys}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                    {sc.desc}
                  </span>
                  <kbd
                    className="px-2 py-1 text-[10px] tracking-[0.05em] font-mono"
                    style={{
                      border: "1px solid var(--line-strong)",
                      color: "var(--accent-glow)",
                      background: "rgba(0,212,255,0.04)",
                    }}
                  >
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* About */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <div
              className="flex items-center justify-between text-[10px] tracking-[0.1em] uppercase"
              style={{ color: "var(--muted-2)" }}
            >
              <span>NIT.BUILDER · v2.0.0-alpha</span>
              <div className="flex gap-4">
                <a
                  href="https://github.com/igor1000rr/nit-builder"
                  target="_blank"
                  rel="noopener"
                  className="no-underline transition hover:text-[color:var(--accent-glow)]"
                  style={{ color: "var(--muted)" }}
                >
                  GitHub
                </a>
                <a
                  href="https://t.me/igor1000rr"
                  target="_blank"
                  rel="noopener"
                  className="no-underline transition hover:text-[color:var(--accent-glow)]"
                  style={{ color: "var(--muted)" }}
                >
                  Telegram
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
