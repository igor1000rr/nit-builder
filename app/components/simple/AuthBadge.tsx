/**
 * AuthBadge — auth state indicator for the nav bar.
 *
 * Three states:
 * - loading: skeleton placeholder while /api/auth/me resolves
 * - unauthenticated: "Войти" + "Регистрация" buttons
 * - authenticated: email + dropdown with "Выйти"
 */

import { useState, useRef, useEffect } from "react";
import type { AuthState } from "~/lib/hooks/useAuth";

type Props = {
  auth: AuthState;
  onOpenSettings: () => void;
};

export function AuthBadge({ auth, onOpenSettings }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if logout fails on server, force reload
    }
    window.location.href = "/";
  }

  if (auth.status === "loading") {
    return (
      <div className="hidden sm:flex items-center px-3 py-2 rounded-full bg-slate-900 border border-slate-800">
        <div className="w-16 h-3 bg-slate-800 rounded animate-pulse" />
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <div className="flex gap-1 items-center">
        <a
          href="/login"
          className="px-3 py-2 text-sm text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900"
        >
          Войти
        </a>
        <a
          href="/register"
          className="px-3 py-2 text-sm bg-gradient-to-r from-blue-500 to-violet-500 rounded-full font-semibold transition hover:scale-[1.02] shadow-md shadow-blue-500/20"
        >
          Регистрация
        </a>
      </div>
    );
  }

  // authenticated
  const initial = auth.email[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 pl-1 pr-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-full transition"
        title={`Залогинен как ${auth.email}`}
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden md:inline text-xs text-slate-300 max-w-[140px] truncate">
          {auth.email}
        </span>
        <svg
          className={`w-3 h-3 text-slate-500 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="p-3 border-b border-slate-800">
            <div className="text-xs text-slate-500 mb-1">Вы вошли как</div>
            <div className="text-sm text-white truncate">{auth.email}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenSettings();
            }}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition flex items-center gap-2"
          >
            <span>⚙️</span>
            <span>Настройки и токен</span>
          </button>
          <a
            href="/download"
            className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition flex items-center gap-2"
          >
            <span>↓</span>
            <span>Скачать tunnel клиент</span>
          </a>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition flex items-center gap-2 border-t border-slate-800 disabled:opacity-50"
          >
            <span>⏻</span>
            <span>{loggingOut ? "Выходим..." : "Выйти"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
