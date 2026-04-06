/**
 * useAuth — React hook to fetch current authentication state from /api/auth/me.
 *
 * Loads once on mount. Does NOT auto-refresh. For real-time tunnel status,
 * use useControlSocket which gets push updates via WebSocket.
 */

import { useEffect, useState } from "react";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      userId: string;
      email: string;
      tunnelTokenCreatedAt: string | null;
    };

export function useAuth(): AuthState {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (data: {
          authenticated: boolean;
          userId?: string;
          email?: string;
          tunnelTokenCreatedAt?: string | null;
        }) => {
          if (cancelled) return;
          if (data.authenticated && data.userId && data.email) {
            setAuth({
              status: "authenticated",
              userId: data.userId,
              email: data.email,
              tunnelTokenCreatedAt: data.tunnelTokenCreatedAt ?? null,
            });
          } else {
            setAuth({ status: "unauthenticated" });
          }
        },
      )
      .catch(() => {
        if (!cancelled) setAuth({ status: "unauthenticated" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return auth;
}
