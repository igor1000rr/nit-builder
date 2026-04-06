import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useAuth } from "~/lib/contexts/AuthContext";

export const meta: MetaFunction = () => [
  { title: "Вход — NIT Builder" },
  { name: "robots", content: "noindex" },
];

export default function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, send to home
  useEffect(() => {
    if (auth.status === "authenticated") {
      window.location.href = "/";
    }
  }, [auth.status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as { error?: string; userId?: string };

      if (!res.ok) {
        setError(data.error ?? "Не удалось войти");
        setLoading(false);
        return;
      }

      // Success — redirect to home
      window.location.href = "/";
    } catch {
      setError("Ошибка сети. Попробуй ещё раз.");
      setLoading(false);
    }
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
          <h1 className="text-3xl font-extrabold mb-2 text-center">Вход</h1>
          <p className="text-slate-400 text-center mb-8">
            Ещё нет аккаунта?{" "}
            <a href="/register" className="text-blue-400 hover:text-blue-300 transition">
              Зарегистрируйся
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
              <label htmlFor="password" className="block text-sm text-slate-400 mb-2">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              {loading ? "Входим..." : "Войти"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            Используя NIT Builder, ты соглашаешься генерировать сайты через свой
            GPU и не эксплуатировать туннель для автоматических атак.
          </p>
        </div>
      </main>
    </div>
  );
}
