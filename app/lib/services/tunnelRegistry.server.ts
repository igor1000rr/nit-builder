/**
 * TunnelRegistry — in-memory state for active tunnel connections.
 *
 * Responsibilities:
 * - Track which users have active tunnel connections
 * - Route browser requests to the right tunnel
 * - Match tunnel responses back to the waiting browser
 * - Handle disconnects, timeouts, multi-tab, multi-tunnel per user
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
};

/** Pending request waiting for tunnel response */
export type PendingRequest = {
  requestId: string;
  userId: string;
  browserSessionId: string;
  tunnelConnectionId: string;
  startedAt: number;
  accumulatedText: string;
  currentStep: PipelineStep;
  /** Template info set after template_selected event */
  templateId?: string;
  templateName?: string;
  /** Called when request completes or errors */
  onComplete?: (html: string) => void;
  onError?: (error: string) => void;
};

// ─── State ───────────────────────────────────────────────────────

/** All active tunnel connections, grouped by userId (one user may have multiple) */
const tunnels = new Map<string, TunnelConnection[]>();

/** All active browser sessions by sessionId */
const browsers = new Map<string, BrowserSession>();

/** Browsers grouped by userId (for broadcasting tunnel_status updates) */
const browsersByUser = new Map<string, Set<string>>();

/** All active pending requests */
const pendingRequests = new Map<string, PendingRequest>();

/** Metric counters */
const stats = {
  totalTunnelsRegistered: 0,
  totalRequestsRouted: 0,
  totalRequestsCompleted: 0,
  totalRequestsFailed: 0,
};

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
  // Simple strategy: return first connection (can add round-robin or health-based selection later)
  return conns[0]!;
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
 * Returns false if no tunnel is available.
 */
export function routeRequest(params: RouteRequestParams): boolean {
  const tunnel = getTunnelForUser(params.userId);
  if (!tunnel) return false;

  const pending: PendingRequest = {
    requestId: params.requestId,
    userId: params.userId,
    browserSessionId: params.browserSessionId,
    tunnelConnectionId: tunnel.connectionId,
    startedAt: Date.now(),
    accumulatedText: "",
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
      req.accumulatedText += event.text;
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
