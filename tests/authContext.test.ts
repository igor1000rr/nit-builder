/**
 * Tests for AuthContext cache + fetch helpers.
 *
 * Doesn't test React component behavior (provider lifecycle, hook
 * subscriptions) — that needs @testing-library/react which isn't
 * installed in this project. Tests cover the pure data layer:
 * cache read/write, TTL expiration, fetch error handling, response
 * parsing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  _readCache,
  _writeCache,
  _fetchAuth,
  _CACHE_KEY,
  _CACHE_TTL_MS,
  type AuthState,
} from "../app/lib/contexts/AuthContext";

// JSDOM-lite localStorage shim for node environment
const storage: Map<string, string> = new Map();
const localStorageMock = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storage.set(k, v);
  },
  removeItem: (k: string) => {
    storage.delete(k);
  },
  clear: () => {
    storage.clear();
  },
  get length() {
    return storage.size;
  },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
};

beforeEach(() => {
  storage.clear();
  // Define window.localStorage in node environment
  vi.stubGlobal("window", { localStorage: localStorageMock });
  vi.stubGlobal("localStorage", localStorageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthContext cache", () => {
  describe("_writeCache", () => {
    it("writes authenticated state to localStorage", () => {
      const state: AuthState = {
        status: "authenticated",
        userId: "user_123",
        email: "test@example.com",
        tunnelTokenCreatedAt: "2026-01-01T00:00:00.000Z",
        tunnel: { status: "online", activeTunnels: 1 },
      };
      _writeCache(state);
      const raw = storage.get(_CACHE_KEY);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.state.status).toBe("authenticated");
      expect(parsed.state.email).toBe("test@example.com");
      expect(typeof parsed.cachedAt).toBe("number");
    });

    it("removes cache on unauthenticated state", () => {
      // First populate
      _writeCache({
        status: "authenticated",
        userId: "u",
        email: "e@e.com",
        tunnelTokenCreatedAt: null,
        tunnel: { status: "offline", activeTunnels: 0 },
      });
      expect(storage.has(_CACHE_KEY)).toBe(true);

      // Then clear via unauth
      _writeCache({ status: "unauthenticated" });
      expect(storage.has(_CACHE_KEY)).toBe(false);
    });

    it("does not write loading state", () => {
      _writeCache({ status: "loading" });
      expect(storage.has(_CACHE_KEY)).toBe(false);
    });
  });

  describe("_readCache", () => {
    it("returns null when no cache exists", () => {
      expect(_readCache()).toBeNull();
    });

    it("returns cached authenticated state when fresh", () => {
      _writeCache({
        status: "authenticated",
        userId: "user_456",
        email: "fresh@example.com",
        tunnelTokenCreatedAt: null,
        tunnel: { status: "online", activeTunnels: 2 },
      });
      const result = _readCache();
      expect(result).not.toBeNull();
      expect(result?.status).toBe("authenticated");
      if (result?.status === "authenticated") {
        expect(result.email).toBe("fresh@example.com");
        expect(result.tunnel.activeTunnels).toBe(2);
      }
    });

    it("returns null and clears cache when expired (past TTL)", () => {
      // Manually write a stale entry
      const stale = {
        state: {
          status: "authenticated" as const,
          userId: "u",
          email: "stale@example.com",
          tunnelTokenCreatedAt: null,
          tunnel: { status: "offline" as const, activeTunnels: 0 },
        },
        cachedAt: Date.now() - _CACHE_TTL_MS - 1000, // 1 second past TTL
      };
      storage.set(_CACHE_KEY, JSON.stringify(stale));

      const result = _readCache();
      expect(result).toBeNull();
      // Should also clean up the stale entry
      expect(storage.has(_CACHE_KEY)).toBe(false);
    });

    it("returns null when cache JSON is malformed", () => {
      storage.set(_CACHE_KEY, "not-valid-json{{{");
      expect(_readCache()).toBeNull();
    });

    it("returns null for non-authenticated cached state", () => {
      // Even if somehow an unauthenticated state ended up cached,
      // never trust it (force re-fetch)
      const cached = {
        state: { status: "unauthenticated" as const },
        cachedAt: Date.now(),
      };
      storage.set(_CACHE_KEY, JSON.stringify(cached));
      expect(_readCache()).toBeNull();
    });
  });

  describe("cache TTL constant", () => {
    it("is set to 5 minutes", () => {
      expect(_CACHE_TTL_MS).toBe(5 * 60 * 1000);
    });
  });

  describe("cache key constant", () => {
    it("is namespaced for nit", () => {
      expect(_CACHE_KEY).toMatch(/^nit_/);
    });
  });
});

describe("AuthContext fetchAuth", () => {
  it("returns unauthenticated on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("unauthenticated");
  });

  it("returns unauthenticated on non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        }),
      ),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("unauthenticated");
  });

  it("returns unauthenticated when API responds authenticated:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ authenticated: false }),
        }),
      ),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("unauthenticated");
  });

  it("returns authenticated state with all fields when API succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authenticated: true,
              userId: "user_abc",
              email: "user@example.com",
              tunnelTokenCreatedAt: "2026-01-01T12:00:00.000Z",
              tunnel: { status: "online", activeTunnels: 3 },
            }),
        }),
      ),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("authenticated");
    if (result.status === "authenticated") {
      expect(result.userId).toBe("user_abc");
      expect(result.email).toBe("user@example.com");
      expect(result.tunnelTokenCreatedAt).toBe("2026-01-01T12:00:00.000Z");
      expect(result.tunnel.status).toBe("online");
      expect(result.tunnel.activeTunnels).toBe(3);
    }
  });

  it("provides default tunnel state when API omits the field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authenticated: true,
              userId: "user_def",
              email: "minimal@example.com",
            }),
        }),
      ),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("authenticated");
    if (result.status === "authenticated") {
      expect(result.tunnel).toEqual({ status: "offline", activeTunnels: 0 });
      expect(result.tunnelTokenCreatedAt).toBeNull();
    }
  });

  it("returns unauthenticated when API response is missing userId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authenticated: true,
              email: "missing-id@example.com",
            }),
        }),
      ),
    );
    const result = await _fetchAuth();
    expect(result.status).toBe("unauthenticated");
  });

  it("sends credentials: include for cookie auth", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await _fetchAuth();
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/me", {
      credentials: "include",
    });
  });
});
