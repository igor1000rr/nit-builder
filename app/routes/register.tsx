import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useAuth } from "~/lib/contexts/AuthContext";
import { GridBg, Orbs, Chip, NitButton, Particles, ScanLine } from "~/components/nit";

export const meta: MetaFunction = () => [
  { title: "Register // NIT.BUILDER" },
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
  const [tokenAcknowledged, setTokenAcknowledged] = useState(false);

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
    <div className="relative min-h-screen text-[color:var(--ink)] nit-grain overflow-hidden">
      <GridBg />
      <Orbs />
      <Particles count={25} />
      <ScanLine />

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
          <span className="nit-display text-lg text-[color:var(--ink)]">NIT.BUILDER</span>
        </a>
      </nav>

      <main className="relative z-10 max-w-[1400px] mx-auto px-8 grid lg:grid-cols-[1.2fr_0.8fr] gap-16 items-center min-h-[calc(100vh-100px)]">
        {/* Manifest */}
        <div className="hidden lg:block">
          <Chip color="acid">⏵ Join the tunnel</Chip>
          <h1 className="nit-display text-[clamp(48px,7vw,96px)] mt-8 mb-8 leading-[0.9]">
            Один email.<br />
            <span style={{ color: "transparent", WebkitTextStroke: "2px var(--accent-glow)" }}>
              Один токен.
            </span>
            <br />
            Свой <span style={{ color: "transparent", WebkitTextStroke: "2px var(--magenta)" }}>GPU.</span>
          </h1>
          <p className="text-[15px] text-[color:var(--muted)] leading-[1.7] max-w-[480px]">
            Регистрация даёт тебе персональный tunnel-token. Этим токеном CLI на
            твоей машине авторизуется в сервере и держит WebSocket-сессию.
            Пароль хранится через argon2id, токен — через HMAC + argon2 хеш.
            Ничего лишнего.
          </p>
        </div>

        {/* Form / Token panel */}
        <div className="w-full">
          <div
            className="relative p-10 backdrop-blur-[10px]"
            style={{
              border: "1px solid var(--line-strong)",
              background: "rgba(10,13,24,0.7)",
              boxShadow: "0 30px 80px rgba(0,212,255,0.15)",
            }}
          >
            {step === "form" ? (
              <>
                <div className="text-[11px] tracking-[0.2em] uppercase mb-2" style={{ color: "var(--accent-glow)" }}>
                  // auth · register
                </div>
                <h2 className="nit-display text-[36px] mb-2">Sign up</h2>
                <p className="text-[12px] text-[color:var(--muted)] mb-8">
                  Уже есть аккаунт?{" "}
                  <a
                    href="/login"
                    className="no-underline transition"
                    style={{ color: "var(--accent-glow)" }}
                  >
                    Войти →
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
                    label="Name (optional)"
                    id="name"
                    type="text"
                    value={name}
                    onChange={setName}
                    placeholder="Igor"
                    autoComplete="name"
                  />
                  <Field
                    label="Password (min 8)"
                    id="password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
                    {loading ? "Creating account..." : "Create account →"}
                  </NitButton>
                </form>
              </>
            ) : (
              <>
                <Chip color="acid">⏵ Account ready</Chip>
                <h2 className="nit-display text-[36px] mt-4 mb-2">Save your token</h2>
                <p className="text-[12px] text-[color:var(--muted)] mb-6">
                  Этот токен показывается{" "}
                  <span style={{ color: "var(--magenta)" }}>один раз</span>.
                  Если потеряешь — перегенерируешь в настройках, но старый
                  немедленно перестанет работать.
                </p>

                <div className="mb-6">
                  <div
                    className="text-[10px] tracking-[0.2em] uppercase mb-2"
                    style={{ color: "var(--muted)" }}
                  >
                    // tunnel · token
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={tunnelToken ?? ""}
                      className="w-full px-4 py-3.5 pr-28 text-[11px] font-mono outline-none"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-[10px] font-bold tracking-[0.15em] uppercase transition"
                      style={{
                        background: copied ? "var(--acid)" : "var(--accent)",
                        color: "#000",
                      }}
                    >
                      {copied ? "✓ COPIED" : "COPY"}
                    </button>
                  </div>
                </div>

                <div
                  className="p-5 mb-6 text-[12px]"
                  style={{
                    border: "1px solid var(--line-strong)",
                    background: "rgba(0,212,255,0.03)",
                  }}
                >
                  <div
                    className="text-[10px] tracking-[0.2em] uppercase mb-3"
                    style={{ color: "var(--accent-glow)" }}
                  >
                    // next steps
                  </div>
                  <ol className="space-y-2 list-none counter-reset-[step] text-[color:var(--muted)]">
                    <li className="flex gap-3">
                      <span style={{ color: "var(--accent-glow)" }}>01 →</span>
                      <a
                        href="/download"
                        className="no-underline transition hover:text-[color:var(--ink)]"
                        style={{ color: "var(--ink)" }}
                      >
                        Скачай tunnel CLI
                      </a>
                    </li>
                    <li className="flex gap-3">
                      <span style={{ color: "var(--accent-glow)" }}>02 →</span>
                      <span>Запусти CLI с этим токеном</span>
                    </li>
                    <li className="flex gap-3">
                      <span style={{ color: "var(--accent-glow)" }}>03 →</span>
                      <span>Открой editor и генери</span>
                    </li>
                  </ol>
                </div>

                {copied || tokenAcknowledged ? (
                  <NitButton href="/" variant="acid" className="w-full">
                    ✓ Token saved · Go to editor →
                  </NitButton>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled
                      className="block w-full text-center px-8 py-4 text-[13px] font-bold tracking-[0.15em] uppercase border cursor-not-allowed"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--muted-2)",
                        background: "transparent",
                      }}
                    >
                      Copy token first ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => setTokenAcknowledged(true)}
                      className="block w-full text-center px-6 py-2 text-[10px] tracking-[0.1em] uppercase transition"
                      style={{ color: "var(--muted-2)" }}
                    >
                      I already saved it, skip →
                    </button>
                  </div>
                )}
              </>
            )}
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
        required={type !== "text"}
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
