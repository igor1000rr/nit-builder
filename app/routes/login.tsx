import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useAuth } from "~/lib/contexts/AuthContext";
import { GridBg, Orbs, Chip, NitButton, Particles } from "~/components/nit";

export const meta: MetaFunction = () => [
  { title: "Login // NITGEN" },
  { name: "robots", content: "noindex" },
];

export default function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      window.location.href = "/";
    } catch {
      setError("Ошибка сети. Попробуй ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen text-[color:var(--ink)] nit-grain overflow-hidden">
      <GridBg />
      <Orbs />
      <Particles count={25} />

      <nav className="relative z-10 px-8 py-6 max-w-[1400px] mx-auto">
        <a href="/" className="flex items-center gap-3 no-underline w-fit">
          <span
            className="block w-7 h-7 relative"
            style={{
              background:
                "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
              animation: "nit-spin 8s linear infinite",
            }}
          >
            <span className="absolute inset-[3px]" style={{ background: "var(--bg)" }} />
          </span>
          <span className="nit-display text-lg text-[color:var(--ink)]">NITGEN</span>
        </a>
      </nav>

      <main className="relative z-10 max-w-[1400px] mx-auto px-8 grid lg:grid-cols-[1.2fr_0.8fr] gap-16 items-center min-h-[calc(100vh-100px)]">
        {/* Manifest left */}
        <div className="hidden lg:block">
          <Chip color="acid">⏵ Welcome back</Chip>
          <h1 className="nit-display text-[clamp(48px,7vw,96px)] mt-8 mb-8 leading-[0.9]">
            Запусти<br />
            свой <span className="block" style={{ color: "transparent", WebkitTextStroke: "2px var(--accent-glow)" }}>тоннель.</span>
          </h1>
          <p className="text-[15px] text-[color:var(--muted)] leading-[1.7] max-w-[480px]">
            Никто не читает твои промпты. Никто не считает токены. Твой GPU
            генерит код у тебя дома, а наш сервер только маршрутизирует
            байты — как почтальон, не вскрывающий конверты.
          </p>

          <div
            className="flex gap-8 mt-12 pt-8"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <div>
              <div className="nit-display text-[24px]" style={{ color: "var(--accent-glow)" }}>
                0₽
              </div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-[color:var(--muted)]">
                forever
              </div>
            </div>
            <div>
              <div className="nit-display text-[24px]" style={{ color: "var(--accent-glow)" }}>
                ∞
              </div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-[color:var(--muted)]">
                generations
              </div>
            </div>
            <div>
              <div className="nit-display text-[24px]" style={{ color: "var(--accent-glow)" }}>
                LOCAL
              </div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-[color:var(--muted)]">
                your gpu
              </div>
            </div>
          </div>
        </div>

        {/* Form right */}
        <div className="w-full">
          <div
            className="relative p-10 backdrop-blur-[10px]"
            style={{
              border: "1px solid var(--line-strong)",
              background: "rgba(10,13,24,0.7)",
              boxShadow: "0 30px 80px rgba(0,212,255,0.15)",
            }}
          >
            <div className="text-[11px] tracking-[0.2em] uppercase mb-2" style={{ color: "var(--accent-glow)" }}>
              // auth · login
            </div>
            <h2 className="nit-display text-[36px] mb-2">Sign in</h2>
            <p className="text-[12px] text-[color:var(--muted)] mb-8">
              Нет аккаунта?{" "}
              <a
                href="/register"
                className="no-underline transition"
                style={{ color: "var(--accent-glow)" }}
              >
                Регистрация →
              </a>
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field
                label="Email"
                id="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <Field
                label="Password"
                id="password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                minLength={8}
              />

              {error && (
                <div
                  className="p-3 text-[12px] tracking-wide"
                  style={{
                    border: "1px solid var(--magenta)",
                    background: "rgba(255,46,147,0.08)",
                    color: "var(--magenta-glow)",
                  }}
                >
                  ⚠ {error}
                </div>
              )}

              <NitButton
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Authenticating..." : "Enter →"}
              </NitButton>
            </form>

            <p className="mt-8 text-[10px] text-[color:var(--muted-2)] tracking-[0.05em] leading-[1.6]">
              Используя NITGEN, ты соглашаешься генерировать сайты через
              свой GPU и не эксплуатировать туннель для автоматических атак.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  id,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: {
  label: string;
  id: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] tracking-[0.2em] uppercase mb-2"
        style={{ color: "var(--muted)" }}
      >
        // {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        className="w-full px-4 py-3.5 text-[14px] font-mono outline-none transition-all"
        style={{
          background: "transparent",
          border: "1px solid var(--line-strong)",
          color: "var(--ink)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--acid)";
          e.currentTarget.style.boxShadow = "0 0 20px rgba(212,255,0,0.2)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--line-strong)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
