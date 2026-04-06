import { useEffect, useState } from "react";

type ProviderInfo = {
  id: string;
  model: string;
  contextWindow: number;
  status: "available" | "checking" | "unreachable";
  latencyMs?: number;
};

type AuthState =
  | { authenticated: false }
  | {
      authenticated: true;
      userId: string;
      email: string;
      tunnel: { status: "online" | "offline"; activeTunnels: number };
      tunnelTokenCreatedAt: string | null;
    };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedProvider: string | null;
  onSelectProvider: (id: string) => void;
};

const PROVIDER_LABELS: Record<string, { name: string; icon: string; desc: string }> = {
  lmstudio: { name: "LM Studio", icon: "🖥", desc: "Локально, бесплатно, приватно" },
  groq: { name: "Groq", icon: "⚡", desc: "Облако, бесплатный tier, быстро" },
  openrouter: { name: "OpenRouter", icon: "🌐", desc: "Облако, 200+ моделей, платно" },
};

const STATUS_BADGE: Record<string, { text: string; color: string }> = {
  available: { text: "доступен", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  checking: { text: "проверяем...", color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  unreachable: { text: "недоступен", color: "text-red-400 bg-red-500/10 border-red-500/30" },
};

const SHORTCUTS = [
  { keys: "⌘ + Enter", desc: "Создать сайт" },
  { keys: "⌘ + H", desc: "История" },
  { keys: "⌘ + D", desc: "Скачать HTML" },
  { keys: "⌘ + ,", desc: "Настройки" },
  { keys: "Esc", desc: "Закрыть / Отмена" },
];

export function SettingsDrawer({ isOpen, onClose, selectedProvider, onSelectProvider }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/providers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { providers: ProviderInfo[] }) => {
        setProviders(data.providers);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));

    // Fetch auth state in parallel
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: AuthState) => setAuth(data))
      .catch(() => setAuth({ authenticated: false }));
  }, [isOpen]);

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
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-white text-lg">Настройки</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Account */}
          {auth?.authenticated ? (
            <div>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                Аккаунт
              </h3>
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{auth.email}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Туннель:{" "}
                      <span
                        className={
                          auth.tunnel.status === "online"
                            ? "text-emerald-400"
                            : "text-slate-400"
                        }
                      >
                        {auth.tunnel.status === "online"
                          ? `● онлайн (${auth.tunnel.activeTunnels})`
                          : "○ офлайн"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-slate-800"
                  >
                    Выйти
                  </button>
                </div>
              </div>
            </div>
          ) : auth?.authenticated === false ? (
            <div>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                Аккаунт
              </h3>
              <div className="flex gap-2">
                <a
                  href="/login"
                  className="flex-1 text-center px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition text-sm"
                >
                  Войти
                </a>
                <a
                  href="/register"
                  className="flex-1 text-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-xl hover:scale-[1.01] transition text-sm font-semibold"
                >
                  Регистрация
                </a>
              </div>
            </div>
          ) : null}

          {/* Tunnel Token (only when authenticated) */}
          {auth?.authenticated && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                Tunnel Token
              </h3>
              {newToken ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200">
                    ⚠️ Токен показан один раз. Скопируй его сейчас.
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={newToken}
                      className="w-full px-3 py-2.5 pr-24 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-300"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={copyToken}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-500 hover:bg-blue-400 rounded text-[10px] font-semibold transition"
                    >
                      {copied ? "✓" : "Копировать"}
                    </button>
                  </div>
                </div>
              ) : showRegenerate ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Для безопасности введи свой пароль. Старый токен будет отозван,
                    все активные туннели отключатся.
                  </p>
                  <input
                    type="password"
                    value={regeneratePassword}
                    onChange={(e) => setRegeneratePassword(e.target.value)}
                    placeholder="Текущий пароль"
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition"
                  />
                  {regenerateError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                      {regenerateError}
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
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs hover:border-slate-700 transition"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={regenerating || regeneratePassword.length === 0}
                      className="flex-1 px-3 py-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg text-xs font-semibold hover:scale-[1.01] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {regenerating ? "..." : "Перегенерировать"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                  <p className="text-xs text-slate-400 mb-3">
                    Токен можно посмотреть только при первой регистрации. Если потерял —
                    перегенерируй (все активные туннели отключатся).
                  </p>
                  {auth.tunnelTokenCreatedAt && (
                    <p className="text-[10px] text-slate-500 mb-3">
                      Создан: {new Date(auth.tunnelTokenCreatedAt).toLocaleDateString("ru")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRegenerate(true)}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    Перегенерировать токен →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Provider selection */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">LLM провайдер</h3>
            {loading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
                <span className="text-sm text-slate-500">Проверяем провайдеров...</span>
              </div>
            ) : providers.length === 0 ? (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                Не найдено ни одного провайдера. Запусти LM Studio или задай GROQ_API_KEY в .env
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => {
                  const label = PROVIDER_LABELS[p.id] ?? { name: p.id, icon: "🤖", desc: "" };
                  const status = STATUS_BADGE[p.status] ?? STATUS_BADGE.checking!;
                  const isSelected = selectedProvider === p.id || (!selectedProvider && p.status === "available");
                  const isDisabled = p.status === "unreachable";

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !isDisabled && onSelectProvider(p.id)}
                      disabled={isDisabled}
                      className={`w-full text-left p-4 rounded-xl border transition ${
                        isSelected
                          ? "border-blue-500/50 bg-blue-500/10"
                          : isDisabled
                          ? "border-slate-800 bg-slate-900/30 opacity-50 cursor-not-allowed"
                          : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{label.icon}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{label.name}</span>
                              {isSelected && p.status === "available" && (
                                <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">активен</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{label.desc}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-slate-500">
                        <span>Модель: <span className="text-slate-300 font-mono">{p.model}</span></span>
                        <span>Контекст: <span className="text-slate-300">{(p.contextWindow / 1000).toFixed(0)}K</span></span>
                        {p.latencyMs !== undefined && (
                          <span>Пинг: <span className="text-emerald-400">{p.latencyMs}ms</span></span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Keyboard shortcuts */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Горячие клавиши</h3>
            <div className="space-y-2">
              {SHORTCUTS.map((sc) => (
                <div key={sc.keys} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-slate-300">{sc.desc}</span>
                  <kbd className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 font-mono">
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* About */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>NIT Builder v2.0.0-alpha.0</span>
              <div className="flex gap-3">
                <a href="https://github.com/igor1000rr/nit-builder" target="_blank" rel="noopener" className="hover:text-white transition">GitHub</a>
                <a href="/about" className="hover:text-white transition">О проекте</a>
                <a href="https://t.me/igor1000rr" target="_blank" rel="noopener" className="hover:text-white transition">Telegram</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
