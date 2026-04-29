/**
 * TunnelRegistry — in-memory state for active tunnel connections.
 *
 * Responsibilities:
 * - Track which users have active tunnel connections
 * - Route browser requests to the right tunnel
 * - Match tunnel responses back to the waiting browser
 * - Handle disconnects, timeouts, multi-tab, multi-tunnel per user
 * - Принудительная revocation: revokeUserTunnels / revokeUserBrowsers для
 *   logout-all и regenerate-tunnel-token (без них старая WS остаётся authed
 *   до natural реконнекта, что эффективно отменяет logout-all на минуты-часы)
 *
 * All state is in-memory — on VPS restart, all tunnels must reconnect.
 * This is intentional: keeps the system simple and stateless.
 */

import type { WebSocket } from "ws";
import type {
  ServerToTunnel,
  ServerToBrowser,
  TunnelCapabilities,
  PipelineStep,
} from "@nit/shared";

// ─── Types ────────────────────────────────────────────────────────

export type TunnelConnection = {
  /** Unique connection ID (not the same as userId — one user can have multiple tunnels) */
  connectionId: string;
  userId: string;
  ws: WebSocket;
  capabilities: TunnelCapabilities;
  clientVersion: string;
  connectedAt: number;
  lastHeartbeat: number;
};

export type BrowserSession = {
  sessionId: string;
  userId: string;
  ws: WebSocket;
  connectedAt: number;
  /**
   * sessionVersion из cookie на момент upgrade. На каждом heartbeat сравнивается
   * с current через getUserSessionVersion (кэш TTL 30s). Если current больше —
   * сессия отозвана (logout-all / password change), WS закрывается. Без этого
   * поля старая WS-сессия пережила бы logout-all до естественного реконнекта.
   *
   * Optional: в dev-режиме без Appwrite version не имеет смысла.
   */
  sessionVersion?: number;
};

/** Pending request waiting for tunnel response */
export type PendingRequest = {
  requestId: string;
  userId: string;
  browserSessionId: string;
  tunnelConnectionId: string;
  startedAt: number;
  /** Обновляется при каждом text/start/done — для stale-cleanup. */
  lastActivityAt: number;
  currentStep: PipelineStep;
  /** Template info set after template_selected event */
  templateId?: string;
  templateName?: string;
  /** Called when request completes or errors */
  onComplete?: (html: string) => void;
  onError?: (error: string) => void;
};

// ─── Safety caps ──────────────────────────────────────────────────
//
// MAX_CONCURRENT_PER_USER: env-конфигурируется через NIT_MAX_CONCURRENT_PER_USER
// (default 3). Считается по юзеру, не по туннелю — даже если у юзера два
// туннеля (ноут+десктоп), общий cap остаётся.
//
// Без cap-а юзер может DoS'ить собственный туннель (LM Studio подавится
// N параллельных stream'ов).
//
// PENDING_TIMEOUT_MS: если туннель отправил response_start и замолчал
// (LLM завис, gpu crash), pendingRequests висит пока не обнулится
// close-frame'ом. За 5 минут без активности — failим запрос и чистим.

const MAX_CONCURRENT_PER_USER = (() => {
  const raw = process.env.NIT_MAX_CONCURRENT_PER_USER;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 3;
})();

const PENDING_TIMEOUT_MS = 5 * 60_000;
const PENDING_SWEEP_INTERVAL_MS = 30_000;

// ─── State ───────────────────────────────────────────────────────

// ─── Singleton state via globalThis ────────────────────────────────
//
// CRITICAL: This module gets loaded TWICE in production:
//   1. Through tsx in server.ts (imports app/lib/server/wsHandlers.server.ts
//      which imports this file directly via tsx — uses fresh source)
//   2. Through the React Router build (build/server/index.js bundles all
//      route loaders, which import this file too — gets a separate copy)
//
// Without singleton state, registerTunnel() in copy #1 would update one
// `stats` object, and getStats() called from /api/health (copy #2) would
// read a different `stats` object — always zero. This is exactly the
// "tunnel connects but UI shows offline" bug.
//
// Fix: store state on globalThis under a unique key. Both copies of the
// module reach the same global, so state is shared.

type RegistryState = {
  tunnels: Map<string, TunnelConnection[]>;
  browsers: Map<string, BrowserSession>;
  browsersByUser: Map<string, Set<string>>;
  pendingRequests: Map<string, PendingRequest>;
  stats: {
    totalTunnelsRegistered: number;
    totalRequestsRouted: number;
    totalRequestsCompleted: number;
    totalRequestsFailed: number;
  };
};

const GLOBAL_KEY = "__NIT_TUNNEL_REGISTRY_STATE__";

function getState(): RegistryState {
  const g = globalThis as unknown as Record<string, RegistryState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      tunnels: new Map(),
      browsers: new Map(),
      browsersByUser: new Map(),
      pendingRequests: new Map(),
      stats: {
        totalTunnelsRegistered: 0,
        totalRequestsRouted: 0,
        totalRequestsCompleted: 0,
        totalRequestsFailed: 0,
      },
    };
  }
  return g[GLOBAL_KEY]!;
}

const _state = getState();
const tunnels = _state.tunnels;
const browsers = _state.browsers;
const browsersByUser = _state.browsersByUser;
const pendingRequests = _state.pendingRequests;
const stats = _state.stats;

// ─── Tunnel management ────────────────────────────────────────────

export function registerTunnel(conn: TunnelConnection): void {
  const existing = tunnels.get(conn.userId) ?? [];
  existing.push(conn);
  tunnels.set(conn.userId, existing);
  stats.totalTunnelsRegistered++;

  // Notify all browser sessions of this user
  broadcastTunnelStatus(conn.userId);
}

export function unregisterTunnel(connectionId: string): void {
  for (const [userId, conns] of tunnels.entries()) {
    const filtered = conns.filter((c) => c.connectionId !== connectionId);
    if (filtered.length !== conns.length) {
      if (filtered.length === 0) {
        tunnels.delete(userId);
      } else {
        tunnels.set(userId, filtered);
      }

      // Fail all pending requests routed to this tunnel
      for (const [reqId, req] of pendingRequests.entries()) {
        if (req.tunnelConnectionId === connectionId) {
          const browser = browsers.get(req.browserSessionId);
          if (browser) {
            sendToBrowser(browser.ws, {
              type: "generate_error",
              requestId: reqId,
              error: "Tunnel disconnected during generation",
              code: "TUNNEL_DISCONNECTED",
            });
          }
          pendingRequests.delete(reqId);
          stats.totalRequestsFailed++;
        }
      }

      broadcastTunnelStatus(userId);
      return;
    }
  }
}

export function getTunnelForUser(userId: string): TunnelConnection | null {
  const conns = tunnels.get(userId);
  if (!conns || conns.length === 0) return null;
  if (conns.length === 1) return conns[0]!;

  // Least-busy strategy: считаем pending-requests per connection и выбираем
  // туннель с минимальной нагрузкой. Раньше возвращали conns[0] всегда —
  // если у юзера два туннеля (ноут + десктоп), весь трафик лил на первый,
  // второй простаивал. При равном количестве pending'ов стабильно выбираем
  // первый (детерминированно для тестов).
  const pendingByTunnel = new Map<string, number>();
  for (const req of pendingRequests.values()) {
    if (req.userId !== userId) continue;
    pendingByTunnel.set(
      req.tunnelConnectionId,
      (pendingByTunnel.get(req.tunnelConnectionId) ?? 0) + 1,
    );
  }

  let best = conns[0]!;
  let bestLoad = pendingByTunnel.get(best.connectionId) ?? 0;
  for (let i = 1; i < conns.length; i++) {
    const c = conns[i]!;
    const load = pendingByTunnel.get(c.connectionId) ?? 0;
    if (load < bestLoad) {
      best = c;
      bestLoad = load;
    }
  }
  return best;
}

export function hasTunnelForUser(userId: string): boolean {
  const conns = tunnels.get(userId);
  return !!conns && conns.length > 0;
}

export function getTunnelCount(userId: string): number {
  return tunnels.get(userId)?.length ?? 0;
}

export function updateHeartbeat(connectionId: string): void {
  for (const conns of tunnels.values()) {
    for (const c of conns) {
      if (c.connectionId === connectionId) {
        c.lastHeartbeat = Date.now();
        return;
      }
    }
  }
}

// ─── Browser session management ───────────────────────────────────

export function registerBrowser(session: BrowserSession): void {
  browsers.set(session.sessionId, session);

  let set = browsersByUser.get(session.userId);
  if (!set) {
    set = new Set();
    browsersByUser.set(session.userId, set);
  }
  set.add(session.sessionId);
}

export function unregisterBrowser(sessionId: string): void {
  const session = browsers.get(sessionId);
  if (!session) return;

  browsers.delete(sessionId);
  const set = browsersByUser.get(session.userId);
  if (set) {
    set.delete(sessionId);
    if (set.size === 0) browsersByUser.delete(session.userId);
  }

  // Abort any pending requests from this browser
  for (const [reqId, req] of pendingRequests.entries()) {
    if (req.browserSessionId === sessionId) {
      abortRequest(reqId);
    }
  }
}

/**
 * Получить session-version юзера для активной browser сессии. Используется
 * heartbeat-revocation: вызывается на каждом heartbeat, сравнивается с
 * сохранённым sessionVersion в session. Если current > stored — закрыть WS.
 */
export function getBrowserSession(sessionId: string): BrowserSession | null {
  return browsers.get(sessionId) ?? null;
}

function broadcastTunnelStatus(userId: string): void {
  const sessions = browsersByUser.get(userId);
  if (!sessions) return;

  const activeTunnels = getTunnelCount(userId);
  const message: ServerToBrowser = {
    type: "tunnel_status",
    status: activeTunnels > 0 ? "online" : "offline",
    activeTunnels,
  };

  for (const sessionId of sessions) {
    const browser = browsers.get(sessionId);
    if (browser) sendToBrowser(browser.ws, message);
  }
}

// ─── Forced revocation ──────────────────────────────────────────────
//
// Используется при logout-all и regenerate-tunnel-token. Без этого
// старая WS остаётся authed до естественного реконнекта (минуты-часы),
// фактически отменяя ревокацию.

/**
 * Закрывает все активные туннели юзера, возвращает их количество.
 * Применение: regenerate-tunnel-token (новый токен → старые туннели должны
 * переаутентифицироваться).
 */
export function revokeUserTunnels(
  userId: string,
  closeCode: number = 4001,
  reason: string = "Tunnel revoked",
): number {
  const conns = tunnels.get(userId);
  if (!conns || conns.length === 0) return 0;

  // Копия — unregisterTunnel ниже мутирует Map (set с новым массивом).
  // Хотя итерация по conns технически безопасна (conns ссылается на старый
  // массив, не мутируется in-place), копия делает поведение более явным.
  const copy = [...conns];
  let closed = 0;
  for (const c of copy) {
    try {
      c.ws.close(closeCode, reason);
    } catch {
      // ws уже закрыт или недоступен — всё равно убираем из реестра
    }
    unregisterTunnel(c.connectionId);
    closed++;
  }
  return closed;
}

/**
 * Закрывает все активные browser-сессии юзера, возвращает их количество.
 * Применение: logout-all (sessionVersion bump'нулась → старые WS должны
 * быть отозваны).
 */
export function revokeUserBrowsers(
  userId: string,
  closeCode: number = 4001,
  reason: string = "Session revoked",
): number {
  const sessionIds = browsersByUser.get(userId);
  if (!sessionIds || sessionIds.size === 0) return 0;

  const copy = Array.from(sessionIds);
  let closed = 0;
  for (const sid of copy) {
    const session = browsers.get(sid);
    if (!session) continue;
    try {
      session.ws.close(closeCode, reason);
    } catch {
      // ws уже закрыт — всё равно чистим реестр
    }
    unregisterBrowser(sid);
    closed++;
  }
  return closed;
}

// ─── Request routing ──────────────────────────────────────────────

export type RouteRequestParams = {
  requestId: string;
  userId: string;
  browserSessionId: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
};

/**
 * Route a generation request from a browser to the user's tunnel.
 * Returns false if no tunnel is available or user hit concurrent cap.
 */
export function routeRequest(params: RouteRequestParams): boolean {
  // Cap: сколько одновременных generate в полёте у юзера.
  const active = countPendingByUser(params.userId);
  if (active >= MAX_CONCURRENT_PER_USER) return false;

  const tunnel = getTunnelForUser(params.userId);
  if (!tunnel) return false;

  const now = Date.now();
  const pending: PendingRequest = {
    requestId: params.requestId,
    userId: params.userId,
    browserSessionId: params.browserSessionId,
    tunnelConnectionId: tunnel.connectionId,
    startedAt: now,
    lastActivityAt: now,
    currentStep: "plan",
  };
  pendingRequests.set(params.requestId, pending);
  stats.totalRequestsRouted++;

  const msg: ServerToTunnel = {
    type: "generate",
    requestId: params.requestId,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxOutputTokens,
    temperature: params.temperature,
  };

  try {
    tunnel.ws.send(JSON.stringify(msg));
    return true;
  } catch {
    pendingRequests.delete(params.requestId);
    stats.totalRequestsFailed++;
    return false;
  }
}

function countPendingByUser(userId: string): number {
  let n = 0;
  for (const req of pendingRequests.values()) {
    if (req.userId === userId) n++;
  }
  return n;
}

export function abortRequest(requestId: string): void {
  const req = pendingRequests.get(requestId);
  if (!req) return;

  // Tell the tunnel to abort
  const tunnel = findTunnelByConnectionId(req.tunnelConnectionId);
  if (tunnel) {
    try {
      tunnel.ws.send(JSON.stringify({ type: "abort", requestId } satisfies ServerToTunnel));
    } catch {
      // Tunnel already disconnected — ignore
    }
  }

  pendingRequests.delete(requestId);
}

function findTunnelByConnectionId(connectionId: string): TunnelConnection | null {
  for (const conns of tunnels.values()) {
    for (const c of conns) {
      if (c.connectionId === connectionId) return c;
    }
  }
  return null;
}

// ─── Tunnel response forwarding ───────────────────────────────────

/**
 * Called by tunnel WebSocket handler when it receives a response message.
 * Forwards to the waiting browser as SSE-style events.
 */
export function handleTunnelResponse(
  requestId: string,
  event:
    | { type: "start" }
    | { type: "text"; text: string }
    | { type: "done"; fullText: string; durationMs: number }
    | { type: "error"; error: string },
): void {
  const req = pendingRequests.get(requestId);
  if (!req) return; // browser already disconnected or aborted

  req.lastActivityAt = Date.now();

  const browser = browsers.get(req.browserSessionId);
  if (!browser) {
    pendingRequests.delete(requestId);
    return;
  }

  switch (event.type) {
    case "start":
      req.currentStep = "code";
      sendToBrowser(browser.ws, {
        type: "generate_step",
        requestId,
        step: "code",
      });
      break;

    case "text":
      // Раньше тут аккумулировался accumulatedText в req — но done event
      // приходит с полным fullText от туннеля, а accumulated нигде не
      // использовался. Удалено чтобы не плодить мёртвую память на каждый
      // active request (32+ KB on average per long generation).
      sendToBrowser(browser.ws, {
        type: "generate_text",
        requestId,
        text: event.text,
      });
      break;

    case "done": {
      const html = event.fullText;
      sendToBrowser(browser.ws, {
        type: "generate_done",
        requestId,
        html,
        templateId: req.templateId ?? "unknown",
        templateName: req.templateName ?? "Unknown",
        durationMs: event.durationMs,
      });
      if (req.onComplete) req.onComplete(html);
      pendingRequests.delete(requestId);
      stats.totalRequestsCompleted++;
      break;
    }

    case "error":
      sendToBrowser(browser.ws, {
        type: "generate_error",
        requestId,
        error: event.error,
        code: "LLM_ERROR",
      });
      if (req.onError) req.onError(event.error);
      pendingRequests.delete(requestId);
      stats.totalRequestsFailed++;
      break;
  }
}

/** Used by orchestrator to set template info mid-pipeline (before Coder step) */
export function setRequestTemplate(
  requestId: string,
  templateId: string,
  templateName: string,
): void {
  const req = pendingRequests.get(requestId);
  if (!req) return;
  req.templateId = templateId;
  req.templateName = templateName;

  const browser = browsers.get(req.browserSessionId);
  if (browser) {
    sendToBrowser(browser.ws, {
      type: "generate_step",
      requestId,
      step: "template",
      templateId,
      templateName,
    });
  }
}

// ─── Utilities ────────────────────────────────────────────────────

function sendToBrowser(ws: WebSocket, msg: ServerToBrowser): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Silently drop — browser disconnected
  }
}

export function getStats() {
  return {
    ...stats,
    activeTunnels: Array.from(tunnels.values()).reduce((sum, arr) => sum + arr.length, 0),
    activeBrowsers: browsers.size,
    pendingRequests: pendingRequests.size,
    uniqueUsersWithTunnel: tunnels.size,
    maxConcurrentPerUser: MAX_CONCURRENT_PER_USER,
  };
}

/** For tests */
export function resetRegistry(): void {
  tunnels.clear();
  browsers.clear();
  browsersByUser.clear();
  pendingRequests.clear();
  stats.totalTunnelsRegistered = 0;
  stats.totalRequestsRouted = 0;
  stats.totalRequestsCompleted = 0;
  stats.totalRequestsFailed = 0;
}

// ─── Stale-pending sweeper ────────────────────────────────────────
//
// Если туннель отвечает start'ом и потом затих (GPU crash, LLM deadlock,
// OOM у клиента), запись в pendingRequests висит пока не сработает close
// WS — а WS-close случится только когда сервер отрубит keepalive (минуты).
// Явный sweeper по lastActivityAt делает поведение предсказуемым.
//
// Храним таймер в globalThis тоже — иначе при двойной загрузке модуля
// (tsx + React Router build) запустится два sweeper'а.

type SweeperState = { timer: NodeJS.Timeout | null };
const SWEEPER_KEY = "__NIT_TUNNEL_REGISTRY_SWEEPER__";

function ensureSweeper(): void {
  const g = globalThis as unknown as Record<string, SweeperState | undefined>;
  if (g[SWEEPER_KEY]?.timer) return;

  const state: SweeperState = { timer: null };
  state.timer = setInterval(() => {
    const now = Date.now();
    for (const [reqId, req] of pendingRequests.entries()) {
      if (now - req.lastActivityAt <= PENDING_TIMEOUT_MS) continue;

      const browser = browsers.get(req.browserSessionId);
      if (browser) {
        sendToBrowser(browser.ws, {
          type: "generate_error",
          requestId: reqId,
          error: "Generation timed out — tunnel stopped responding",
          code: "TUNNEL_DISCONNECTED",
        });
      }
      pendingRequests.delete(reqId);
      stats.totalRequestsFailed++;
    }
  }, PENDING_SWEEP_INTERVAL_MS);

  // unref — не мешаем процессу завершиться
  state.timer.unref?.();
  g[SWEEPER_KEY] = state;

  if (typeof process !== "undefined") {
    const cleanup = () => {
      if (state.timer) clearInterval(state.timer);
    };
    process.on?.("SIGTERM", cleanup);
    process.on?.("SIGINT", cleanup);
  }
}

ensureSweeper();
