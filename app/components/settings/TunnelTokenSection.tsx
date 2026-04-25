/**
 * TunnelTokenSection — управление tunnel-токеном.
 *
 * Три состояния:
 *  1. idle      — показываем "Created: <date>" + кнопку "Regenerate"
 *  2. confirming — форма пароля + Cancel/Regenerate
 *  3. revealed  — новый токен показан один раз с COPY
 *
 * Виден только для authenticated юзеров.
 */

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/contexts/AuthContext";

type Props = {
  /** Reset внутреннего стейта когда drawer закрылся. */
  resetSignal: boolean;
};

export function TunnelTokenSection({ resetSignal }: Props) {
  const auth = useAuth();
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Reset internal state когда drawer закрывается (resetSignal toggles).
  useEffect(() => {
    if (resetSignal) {
      setShowRegenerate(false);
      setPassword("");
      setError(null);
      setNewToken(null);
      setCopied(false);
    }
  }, [resetSignal]);

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/regenerate-tunnel-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { tunnelToken?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось сгенерировать токен");
        setRegenerating(false);
        return;
      }
      setNewToken(data.tunnelToken ?? null);
      setPassword("");
    } catch {
      setError("Ошибка сети");
    } finally {
      setRegenerating(false);
    }
  }

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard
      .writeText(newToken)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setError("Буфер обмена недоступен. Скопируй токен вручную.");
      });
  }

  if (auth.status !== "authenticated") return null;

  return (
    <div>
      <div
        className="text-[10px] tracking-[0.2em] uppercase mb-3"
        style={{ color: "var(--accent-glow)" }}
      >
        // tunnel · token
      </div>

      {newToken ? (
        // ─── Token revealed ──────────────────────────
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
        // ─── Confirm password ────────────────────────
        <div className="space-y-3">
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            Введи свой пароль. Старый токен будет отозван, все активные
            туннели отключатся немедленно.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {error && (
            <div
              className="p-2 text-[11px]"
              style={{
                border: "1px solid var(--magenta)",
                background: "rgba(255,46,147,0.05)",
                color: "var(--magenta-glow)",
              }}
            >
              ⚠ {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowRegenerate(false);
                setPassword("");
                setError(null);
              }}
              className="flex-1 px-3 py-2.5 text-[10px] tracking-[0.15em] uppercase transition"
              style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || password.length === 0}
              className="flex-1 px-3 py-2.5 text-[10px] font-bold tracking-[0.15em] uppercase text-black transition disabled:opacity-30"
              style={{ background: "var(--magenta)" }}
            >
              {regenerating ? "..." : "Regenerate"}
            </button>
          </div>
        </div>
      ) : (
        // ─── Idle state ─────────────────────────────
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
  );
}
