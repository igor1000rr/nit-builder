/**
 * WebSocket connection handlers for /api/tunnel and /api/control.
 *
 * Called from the custom server.js during HTTP upgrade routing.
 * Kept in app/lib/server/ so they get compiled with the rest of the
 * app and can use `~/` imports and Zod schemas.
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import {
  PROTOCOL_VERSION,
  NIT_SERVER_VERSION,
  type TunnelToServer,
  type ServerToTunnel,
  type BrowserToServer,
  type ServerToBrowser,
} from "@nit/shared";
import {
  registerTunnel,
  unregisterTunnel,
  registerBrowser,
  unregisterBrowser,
  updateHeartbeat,
  handleTunnelResponse,
  routeRequest,
  abortRequest,
  setRequestTemplate,
  hasTunnelForUser,
  getTunnelCount,
  type TunnelConnection,
  type BrowserSession,
} from "~/lib/services/tunnelRegistry.server";
import { randomUUID } from "node:crypto";
import {
  findUserByTunnelToken,
  getUserById,
  isAppwriteConfigured,
} from "./appwrite.server";
import { parseSessionCookie, verifySessionToken } from "./sessionCookie.server";

const SERVER_VERSION = NIT_SERVER_VERSION;

// ─── WebSocket keepalive ──────────────────────────────────────────
//
// Nginx / любые intermediate прокси рубят WS-соединение если через него
// нет трафика ~60с. Client-side heartbeat недостаточно надёжен: он идёт
// в один конец (client → server), и если где-то по дороге буферизация —
// ping всё равно может не пройти сквозь proxy вовремя.
//
// Правильный фикс: server-side WebSocket-level ping каждые 30с
// + отслеживание pong через флаг isAlive. Если между двумя ping'ами
// pong не пришёл — соединение мертво, принудительно terminate.
// Браузер/клиент тогда увидит close и переподключится.

const KEEPALIVE_INTERVAL_MS = 30_000;

function installKeepalive(ws: WebSocket, label: string): () => void {
  let isAlive = true;

  const onPong = (): void => {
    isAlive = true;
  };
  ws.on("pong", onPong);

  const interval = setInterval(() => {
    if (!isAlive) {
      console.log(`[${label}] keepalive: pong timeout, terminating`);
      try {
        ws.terminate();
      } catch {
        // noop
      }
      return;
    }
    isAlive = false;
    try {
      ws.ping();
    } catch {
      // soket уже закрыт — следующий tick увидит isAlive=false
    }
  }, KEEPALIVE_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    ws.off("pong", onPong);
  };
}

// ─── Auth ─────────────────────────────────────────────────────────
// Phase B.3: real Appwrite auth, with dev-token fallback when APPWRITE_API_KEY
// is not set (makes local E2E testing possible without a live Appwrite).

async function validateTunnelToken(token: string): Promise<{ userId: string } | null> {
  // Dev fallback: if Appwrite is not configured, allow a hardcoded env token.
  // This is ONLY for local development and CI smoke tests.
  if (!isAppwriteConfigured()) {
    const devToken = process.env.NIT_DEV_TUNNEL_TOKEN;
    if (devToken && token === devToken) {
      return { userId: "dev-user" };
    }
    return null;
  }

  // Production path: Appwrite lookup with HMAC index + argon2 verify
  return findUserByTunnelToken(token);
}

async function validateBrowserSession(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  // Dev fallback
  if (!isAppwriteConfigured()) {
    if (token === "dev-session") {
      return { userId: "dev-user", email: "dev@local" };
    }
    return null;
  }

  // Production: verify HMAC signature, then look up user by id
  const userId = verifySessionToken(token);
  if (!userId) return null;

  return getUserById(userId);
}

// ─── Tunnel handler (desktop client → server) ────────────────────

export function handleTunnelConnection(ws: WebSocket, req: IncomingMessage): void {
  const connectionId = randomUUID();
  let authed: TunnelConnection | null = null;

  const stopKeepalive = installKeepalive(ws, "tunnel");

  const send = (msg: ServerToTunnel): void => {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Connection closed
    }
  };

  const closeWithError = (
    code: "AUTH_FAILED" | "INVALID_TOKEN" | "PROTOCOL_MISMATCH" | "RATE_LIMITED",
    message: string,
  ): void => {
    send({ type: "error", code, message });
    ws.close(4000, message);
  };

  // Auth timeout — must send hello within 5 seconds
  const authTimer = setTimeout(() => {
    if (!authed) {
      console.log("[tunnel] Auth timeout, closing");
      ws.close(4001, "Auth timeout");
    }
  }, 5_000);

  ws.on("message", (raw) => {
    let msg: TunnelToServer;
    try {
      msg = JSON.parse(raw.toString()) as TunnelToServer;
    } catch {
      console.log("[tunnel] Malformed message");
      return;
    }

    switch (msg.type) {
      case "hello": {
        if (authed) {
          console.log("[tunnel] Duplicate hello, ignoring");
          return;
        }

        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          closeWithError(
            "PROTOCOL_MISMATCH",
            `Expected protocol ${PROTOCOL_VERSION}, got ${msg.protocolVersion}`,
          );
          return;
        }

        // Async auth — must be wrapped since ws.on("message") is sync
        const helloMsg = msg;
        void (async () => {
          const user = await validateTunnelToken(helloMsg.token);
          if (!user) {
            closeWithError("INVALID_TOKEN", "Invalid tunnel token");
            return;
          }

          // Check if auth completed too late (timeout fired)
          if (authed) return;

          clearTimeout(authTimer);

          authed = {
            connectionId,
            userId: user.userId,
            ws,
            capabilities: helloMsg.capabilities,
            clientVersion: helloMsg.clientVersion,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
          };

          registerTunnel(authed);
          send({
            type: "welcome",
            serverVersion: SERVER_VERSION,
            userId: user.userId,
            sessionId: connectionId,
          });
          console.log(
            `[tunnel] ✓ Connected: user=${user.userId} client=${helloMsg.clientVersion} runtime=${helloMsg.capabilities.runtime} model=${helloMsg.capabilities.model}`,
          );
        })();
        break;
      }

      case "heartbeat": {
        if (!authed) return;
        updateHeartbeat(connectionId);
        send({ type: "heartbeat_ack", serverTime: Date.now() });
        break;
      }

      case "response_start":
      case "response_text":
      case "response_done":
      case "response_error": {
        if (!authed) return;

        const requestId = msg.requestId;
        if (msg.type === "response_start") {
          handleTunnelResponse(requestId, { type: "start" });
        } else if (msg.type === "response_text") {
          handleTunnelResponse(requestId, { type: "text", text: msg.text });
        } else if (msg.type === "response_done") {
          handleTunnelResponse(requestId, {
            type: "done",
            fullText: msg.fullText,
            durationMs: msg.durationMs,
          });
        } else {
          handleTunnelResponse(requestId, { type: "error", error: msg.error });
        }
        break;
      }
    }
  });

  ws.on("close", (code, reason) => {
    stopKeepalive();
    clearTimeout(authTimer);
    if (authed) {
      console.log(`[tunnel] Closed: user=${authed.userId} code=${code} reason=${reason}`);
      unregisterTunnel(connectionId);
    }
  });

  ws.on("error", (err) => {
    console.error(`[tunnel] Error: ${err.message}`);
  });
}

// ─── Control handler (browser → server) ──────────────────────────

export function handleControlConnection(ws: WebSocket, req: IncomingMessage): void {
  const sessionId = randomUUID();
  let authed: BrowserSession | null = null;

  const stopKeepalive = installKeepalive(ws, "control");

  const send = (msg: ServerToBrowser): void => {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Connection closed
    }
  };

  const authTimer = setTimeout(() => {
    if (!authed) {
      console.log("[control] Auth timeout, closing");
      ws.close(4001, "Auth timeout");
    }
  }, 5_000);

  // Try to auto-authenticate from cookie header sent during WebSocket upgrade.
  // This is the primary auth path — browser sends session cookie with upgrade
  // request (same-origin), and we verify the HMAC signature locally.
  void (async () => {
    const cookieHeader = req.headers.cookie ?? null;
    const token = parseSessionCookie(cookieHeader);

    if (!token) {
      console.log(
        `[control] Browser connected without session cookie (will wait 5s for auth message)`,
      );
      return;
    }

    const user = await validateBrowserSession(token);
    if (!user) {
      console.log(
        `[control] ✗ Invalid session cookie (token length=${token.length}), closing`,
      );
      ws.close(4001, "Invalid session");
      return;
    }

    if (authed) return; // race: auth message from client arrived first
    clearTimeout(authTimer);
    authed = {
      sessionId,
      userId: user.userId,
      ws,
      connectedAt: Date.now(),
    };
    registerBrowser(authed);
    send({
      type: "authed",
      userId: user.userId,
      email: user.email,
      tunnelStatus: hasTunnelForUser(user.userId) ? "online" : "offline",
      activeTunnels: getTunnelCount(user.userId),
    });
    console.log(
      `[control] ✓ Browser auto-authed via cookie: user=${user.userId} session=${sessionId} tunnelStatus=${hasTunnelForUser(user.userId) ? "online" : "offline"}`,
    );
  })();

  ws.on("message", (raw) => {
    let msg: BrowserToServer;
    try {
      msg = JSON.parse(raw.toString()) as BrowserToServer;
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth": {
        if (authed) return;

        const authMsg = msg;
        void (async () => {
          const user = await validateBrowserSession(authMsg.jwt);
          if (!user) {
            ws.close(4001, "Auth failed");
            return;
          }
          if (authed) return; // race: timeout may have fired

          clearTimeout(authTimer);

          authed = {
            sessionId,
            userId: user.userId,
            ws,
            connectedAt: Date.now(),
          };

          registerBrowser(authed);
          send({
            type: "authed",
            userId: user.userId,
            email: user.email,
            tunnelStatus: hasTunnelForUser(user.userId) ? "online" : "offline",
            activeTunnels: getTunnelCount(user.userId),
          });
          console.log(
            `[control] ✓ Browser authed: user=${user.userId} session=${sessionId}`,
          );
        })();
        break;
      }

      case "generate": {
        if (!authed) return;

        // Build Coder-style prompt — for Phase A we stub with minimal template adaptation.
        // Phase B will properly integrate with the existing orchestrator.
        const routed = routeRequest({
          requestId: msg.requestId,
          userId: authed.userId,
          browserSessionId: sessionId,
          system: `You are an HTML generator. Create a full HTML page for: "${msg.prompt}". Use Tailwind CDN and Alpine.js. Start with <!DOCTYPE html>.`,
          prompt: msg.prompt,
          maxOutputTokens: 8000,
          temperature: 0.4,
        });

        if (!routed) {
          // routeRequest возвращает false либо если нет туннеля, либо если
          // юзер упёрся в concurrent-cap. Различаем через hasTunnelForUser
          // чтобы юзеру сказали понятную ошибку.
          const hasTunnel = hasTunnelForUser(authed.userId);
          send({
            type: "generate_error",
            requestId: msg.requestId,
            error: hasTunnel
              ? "Слишком много параллельных генераций. Дождись завершения текущих."
              : "No tunnel connected. Install NIT Tunnel on a device with a GPU.",
            code: hasTunnel ? "RATE_LIMITED" : "NO_TUNNEL",
          });
          return;
        }

        // Phase A: hardcode template info, Phase B gets it from plan stage
        setRequestTemplate(msg.requestId, "blank-landing", "Универсальный");
        break;
      }

      case "abort": {
        if (!authed) return;
        abortRequest(msg.requestId);
        break;
      }

      case "heartbeat": {
        send({ type: "heartbeat_ack" });
        break;
      }
    }
  });

  ws.on("close", () => {
    stopKeepalive();
    clearTimeout(authTimer);
    if (authed) {
      console.log(`[control] Browser closed: user=${authed.userId}`);
      unregisterBrowser(sessionId);
    }
  });

  ws.on("error", (err) => {
    console.error(`[control] Error: ${err.message}`);
  });
}
