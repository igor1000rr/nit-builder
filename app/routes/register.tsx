import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useAuth } from "~/lib/contexts/AuthContext";

export const meta: MetaFunction = () => [
  { title: "Регистрация — NIT Builder" },
  { name: "robots", content: "noindex" },
];

type Step = "form" | "token";

export default function Register() {
  const auth = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tunnelToken, setTunnelToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // If already logged in (and not on the post-registration token screen),
  // send to home — they shouldn't see the form
  useEffect(() => {
    if (step === "form" && auth.status === "authenticated") {
      window.location.href = "/";
    }
  }, [step, auth.status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });

      const data = (await res.json()) as {
        error?: string;
        userId?: string;
        tunnelToken?: string;
        issues?: Record<string, string[]>;
      };

      if (!res.ok) {
        if (data.issues) {
          const firstIssue = Object.values(data.issues).flat()[0];
          setError(firstIssue ?? data.error ?? "Ошибка валидации");
        } else {
          setError(data.error ?? "Не удалось зарегистрироваться");
        }
        setLoading(false);
        return;
      }

      if (!data.tunnelToken) {
        setError("Сервер не вернул токен. Напиши в поддержку.");
        setLoading(false);
        return;
      }

      setTunnelToken(data.tunnelToken);
      setStep("token");
    } catch {
      setError("Ошибка сети. Попробуй ещё раз.");
      setLoading(false);
    }
  }

  function copyToken() {
    if (!tunnelToken) return;
    navigator.clipboard.writeText(tunnelToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <nav className="px-6 py-5 max-w-6xl mx-auto w-full">
        <a
          href="/"
          className="font-bold text-xl bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent"
        >
          NIT Builder
        </a>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md">
          {step === "form" ? (
            <>
              <h1 className="text-3xl font-extrabold mb-2 text-center">Регистрация</h1>
              <p className="text-slate-400 text-center mb-8">
                Уже есть аккаунт?{" "}
                <a href="/login" className="text-blue-400 hover:text-blue-300 transition">
                  Войти
                </a>
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm text-slate-400 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl focus:border-blue-500 focus:outline-none transition"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="name" className="block text-sm text-slate-400 mb-2">
                    Имя <span className="text-slate-600">(необязательно)</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl focus:border-blue-500 focus:outline-none transition"
                    placeholder="Игорь"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm text-slate-400 mb-2">
                    Пароль <span className="text-slate-600">(минимум 8 символов)</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl focus:border-blue-500 focus:outline-none transition"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 rounded-xl font-semibold hover:scale-[1.01] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
                >
                  {loading ? "Регистрируем..." : "Создать аккаунт"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">🎉</div>
                <h1 className="text-3xl font-extrabold mb-2">Готово!</h1>
                <p className="text-slate-400">Аккаунт создан. Сохрани свой tunnel token.</p>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  <div className="text-sm text-amber-200">
                    <strong>Этот токен показывается только один раз.</strong>
                    <br />
                    Скопируй его сейчас. Если потеряешь — сможешь перегенерировать в настройках.
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-2">
                  Твой Tunnel Token
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={tunnelToken ?? ""}
                    className="w-full px-4 py-3 pr-24 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 focus:outline-none"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={copyToken}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-xs font-semibold transition"
                  >
                    {copied ? "✓ Скопировано" : "Копировать"}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-400 mb-6">
                <p className="mb-2 font-semibold text-slate-300">Что дальше:</p>
                <ol className="space-y-1 list-decimal list-inside">
                  <li>
                    <a
                      href="/download"
                      className="text-blue-400 hover:text-blue-300 transition"
                    >
                      Скачай NIT Tunnel клиент →
                    </a>
                  </li>
                  <li>Запусти клиент и вставь токен</li>
                  <li>Возвращайся на сайт и создавай сайты через свой GPU</li>
                </ol>
              </div>

              <a
                href="/"
                className="block w-full text-center px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 rounded-xl font-semibold hover:scale-[1.01] transition shadow-lg shadow-blue-500/30"
              >
                На главную →
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
