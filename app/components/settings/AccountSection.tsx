/**
 * AccountSection — секция Account в SettingsDrawer.
 * Показывает:
 *  - email + tunnel-status pulse-dot для authenticated юзера
 *  - Login/Register CTA для unauthenticated
 *  - Log out + Log out everywhere actions
 */

import { useState } from "react";
import { useAuth, useAuthRefetch } from "~/lib/contexts/AuthContext";

type Props = {
  onClose: () => void;
};

export function AccountSection({ onClose }: Props) {
  const auth = useAuth();
  const refetchAuth = useAuthRefetch();
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refetchAuth();
    onClose();
  }

  async function handleLogoutAll() {
    // Необратимое действие — все сессии на всех устройствах закрываются.
    // Юзер видит logged-out state на этой вкладке (cookie почищена в ответе),
    // остальные вкладки/устройства при следующем запросе к API получат 401.
    // Нативный confirm() уместен для destructive operation.
    // eslint-disable-next-line no-alert -- intentional destructive confirmation
    if (!confirm("Выйти со всех устройств? Все активные сессии будут закрыты.")) {
      return;
    }
    setLoggingOutAll(true);
    try {
      await fetch("/api/auth/logout-all", {
        method: "POST",
        credentials: "include",
      });
      await refetchAuth();
      onClose();
    } finally {
      setLoggingOutAll(false);
    }
  }

  if (auth.status === "unauthenticated") {
    return (
      <div>
        <SectionHeader>// account</SectionHeader>
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
    );
  }

  if (auth.status !== "authenticated") return null;

  const tunnelOnline = auth.tunnel.status === "online";

  return (
    <div>
      <SectionHeader>// account</SectionHeader>
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
                style={{ color: tunnelOnline ? "var(--acid)" : "var(--muted)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: tunnelOnline ? "var(--acid)" : "var(--muted)",
                    boxShadow: tunnelOnline ? "0 0 8px var(--acid)" : undefined,
                    animation: tunnelOnline ? "nit-pulse 2s infinite" : undefined,
                  }}
                />
                {tunnelOnline
                  ? `online · ${auth.tunnel.activeTunnels}`
                  : "offline"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 text-[10px] tracking-[0.15em] uppercase transition"
            style={{ border: "1px solid var(--line-strong)", color: "var(--magenta)" }}
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
        {/* Logout-all — отдельная destructive ссылка под основным блоком */}
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <span className="text-[10px]" style={{ color: "var(--muted-2)" }}>
            Если потерял устройство или думаешь, что cookie утекла
          </span>
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={loggingOutAll}
            className="text-[10px] tracking-[0.1em] uppercase transition disabled:opacity-40"
            style={{ color: "var(--magenta)" }}
          >
            {loggingOutAll ? "..." : "→ Log out everywhere"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] tracking-[0.2em] uppercase mb-3"
      style={{ color: "var(--accent-glow)" }}
    >
      {children}
    </div>
  );
}
