/**
 * AuthContext — single shared auth state across the entire app.
 *
 * Lifts the previously component-local useAuth() hook into a Context
 * provider so that:
 * - Only ONE fetch to /api/auth/me per page load (not 3 like before)
 * - All consumers (Home, AuthBadge, HistoryPanel, SettingsDrawer) see
 *   the same state and update simultaneously
 * - Logout / login can invalidate the state via refetch() to update
 *   the entire UI without a full page reload
 *
 * Provider goes around the entire app in root.tsx. Consumers call
 * useAuth() — same name as before, drop-in replacement.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      userId: string;
      email: string;
      tunnelTokenCreatedAt: string | null;
      tunnel: { status: "online" | "offline"; activeTunnels: number };
    };

type AuthContextValue = {
  auth: AuthState;
  refetch: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ApiResponse = {
  authenticated: boolean;
  userId?: string;
  email?: string;
  tunnelTokenCreatedAt?: string | null;
  tunnel?: { status: "online" | "offline"; activeTunnels: number };
};

const CACHE_KEY = "nit_auth_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CachedAuth = {
  state: AuthState;
  cachedAt: number;
};

function readCache(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedAuth;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }
    // Only trust cached "authenticated" state — never cache "loading"
    if (cached.state.status !== "authenticated") return null;
    return cached.state;
  } catch {
    return null;
  }
}

function writeCache(state: AuthState): void {
  if (typeof window === "undefined") return;
  try {
    if (state.status === "authenticated") {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ state, cachedAt: Date.now() } satisfies CachedAuth),
      );
    } else if (state.status === "unauthenticated") {
      window.localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded)
  }
}

async function fetchAuth(): Promise<AuthState> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return { status: "unauthenticated" };
    const data = (await res.json()) as ApiResponse;
    if (data.authenticated && data.userId && data.email) {
      return {
        status: "authenticated",
        userId: data.userId,
        email: data.email,
        tunnelTokenCreatedAt: data.tunnelTokenCreatedAt ?? null,
        tunnel: data.tunnel ?? { status: "offline", activeTunnels: 0 },
      };
    }
    return { status: "unauthenticated" };
  } catch {
    return { status: "unauthenticated" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use cached auth state as initial value if available — gives instant
  // UI on revisit instead of loading skeleton flash. Background fetch
  // still revalidates after mount.
  const [auth, setAuth] = useState<AuthState>(() => {
    const cached = readCache();
    return cached ?? { status: "loading" };
  });

  const refetch = useCallback(async () => {
    const next = await fetchAuth();
    setAuth(next);
    writeCache(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAuth().then((next) => {
      if (!cancelled) {
        setAuth(next);
        writeCache(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ auth, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Subscribe to current auth state.
 *
 * Returns the AuthState directly. Components that need to invalidate
 * the cache after login/logout should use useAuthRefetch().
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Outside provider — fall back to loading. Useful for SSR or tests
    // where the provider hasn't been wrapped yet.
    return { status: "loading" };
  }
  return ctx.auth;
}

/**
 * Get the refetch function to invalidate auth state after a mutation
 * (login, register, logout, regenerate token).
 *
 * Usage:
 *   const refetch = useAuthRefetch();
 *   async function onLogout() {
 *     await fetch("/api/auth/logout", { ... });
 *     await refetch();
 *   }
 */
export function useAuthRefetch(): () => Promise<void> {
  const ctx = useContext(AuthContext);
  if (!ctx) return async () => {};
  return ctx.refetch;
}

// ─── Exported for tests ─────────────────────────────────────────

/** @internal — exported for tests only */
export function _readCache(): AuthState | null {
  return readCache();
}

/** @internal — exported for tests only */
export function _writeCache(state: AuthState): void {
  writeCache(state);
}

/** @internal — exported for tests only */
export function _fetchAuth(): Promise<AuthState> {
  return fetchAuth();
}

/** @internal — cache key constant for tests */
export const _CACHE_KEY = CACHE_KEY;
export const _CACHE_TTL_MS = CACHE_TTL_MS;
