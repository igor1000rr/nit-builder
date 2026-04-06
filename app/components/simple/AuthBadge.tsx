/**
 * AuthBadge — auth state indicator for the nav bar.
 *
 * Three states:
 * - loading: skeleton placeholder while /api/auth/me resolves
 * - unauthenticated: "Login" + "Register" buttons
 * - authenticated: email + dropdown
 */

import { useState, useRef, useEffect } from "react";
import type { AuthState } from "~/lib/contexts/AuthContext";
import { useAuthRefetch } from "~/lib/contexts/AuthContext";

type Props = {
  auth: AuthState;
  onOpenSettings: () => void;
};

export function AuthBadge({ auth, onOpenSettings }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const refetchAuth = useAuthRefetch();

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
      await refetchAuth();
      setMenuOpen(false);
    } catch {
      await refetchAuth();
    } finally {
      setLoggingOut(false);
    }
  }

  if (auth.status === "loading") {
    return (
      <div
        className="hidden sm:flex items-center px-3 py-2"
        style={{ border: "1px solid var(--line)" }}
      >
        <div
          className="w-16 h-3 animate-pulse"
          style={{ background: "var(--line-strong)" }}
        />
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <div className="flex gap-1.5 items-center">
        <a
          href="/login"
          className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase transition no-underline text-[color:var(--muted)] hover:text-[color:var(--ink)]"
        >
          Login
        </a>
        <a
          href="/register"
          className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase no-underline transition text-black"
          style={{
            background: "var(--accent)",
            boxShadow: "var(--glow-cyan-sm)",
          }}
        >
          Register →
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
        className="flex items-center gap-2.5 pl-1 pr-3 py-1 transition"
        style={{
          border: "1px solid var(--line-strong)",
          background: "rgba(10,13,24,0.6)",
        }}
        title={`Logged in as ${auth.email}`}
      >
        <span
          className="w-7 h-7 flex items-center justify-center text-[11px] font-bold text-black nit-display"
          style={{ background: "var(--accent)" }}
        >
          {initial}
        </span>
        <span
          className="hidden md:inline text-[11px] tracking-[0.05em] max-w-[140px] truncate font-mono"
          style={{ color: "var(--ink-dim)" }}
        >
          {auth.email}
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="square"
            strokeLinejoin="miter"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 mt-2 w-72 z-50 backdrop-blur-[10px]"
          style={{
            background: "rgba(10,13,24,0.95)",
            border: "1px solid var(--line-strong)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--line)",
          }}
        >
          <div
            className="p-4"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-1"
              style={{ color: "var(--accent-glow)" }}
            >
              // signed in as
            </div>
            <div
              className="text-[12px] font-mono truncate"
              style={{ color: "var(--ink)" }}
            >
              {auth.email}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenSettings();
            }}
            className="w-full text-left px-4 py-3 text-[11px] tracking-[0.1em] uppercase transition flex items-center gap-3"
            style={{ color: "var(--ink-dim)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,212,255,0.05)";
              e.currentTarget.style.color = "var(--accent-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--ink-dim)";
            }}
          >
            <span style={{ color: "var(--accent-glow)" }}>⚙</span>
            <span>Settings · token</span>
          </button>
          <a
            href="/download"
            className="w-full text-left px-4 py-3 text-[11px] tracking-[0.1em] uppercase no-underline transition flex items-center gap-3"
            style={{ color: "var(--ink-dim)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,212,255,0.05)";
              e.currentTarget.style.color = "var(--accent-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--ink-dim)";
            }}
          >
            <span style={{ color: "var(--accent-glow)" }}>↓</span>
            <span>Download tunnel CLI</span>
          </a>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-4 py-3 text-[11px] tracking-[0.1em] uppercase transition flex items-center gap-3 disabled:opacity-50"
            style={{
              borderTop: "1px solid var(--line)",
              color: "var(--magenta)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,46,147,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>⏻</span>
            <span>{loggingOut ? "Logging out..." : "Log out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
