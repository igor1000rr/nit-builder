/**
 * WebSocket connection handlers for /api/tunnel and /api/control.
 *
 * Called from the custom server.js during HTTP upgrade routing.
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
import { analyzePrompt, buildEnrichedSystemPrompt } from "~/lib/services/promptAnalyzer";

const SERVER_VERSION = NIT_SERVER_VERSION;

// ─── WebSocket keepalive ──────────────────────────────────────────

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

async function validateTunnelToken(token: string): Promise<{ userId: string } | null> {
  if (!isAppwriteConfigured()) {
    const devToken = process.env.NIT_DEV_TUNNEL_TOKEN;
    if (devToken && token === devToken) {
      return { userId: "dev-user" };
    }
    return null;
  }
  return findUserByTunnelToken(token);
}

async function validateBrowserSession(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  if (!isAppwriteConfigured()) {
    if (token === "dev-session") {
      return { userId: "dev-user", email: "dev@local" };
    }
    return null;
  }

  // verifySessionToken после коммита session-version revocation возвращает
  // объект { userId, sessionVersion }, а не просто string. Достаём userId.
  // Примечание: здесь мы НЕ проверяем sessionVersion vs current — WS
  // auth происходит один раз при upgrade, и revocation проявится при
  // следующем WS-реконнекте (юзер будет выкинут когда tunnel_status
  // или heartbeat приходит и session cookie уже невалидна).
  const verified = verifySessionToken(token);
  if (!verified) return null;

  return getUserById(verified.userId);
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

        const helloMsg = msg;
        void (async () => {
          const user = await validateTunnelToken(helloMsg.token);
          if (!user) {
            closeWithError("INVALID_TOKEN", "Invalid tunnel token");
            return;
          }

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

    if (authed) return;
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
          if (authed) return;

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

        // Полный анализ промпта: template, tone, colors, business name,
        // sections, language, audience. Раньше передавали только template +
        // generic prompt — Coder выбирал тон/палитру наобум. Теперь всё явно,
        // результат воспроизводим и соответствует запросу.
        const analysis = analyzePrompt(msg.prompt);
        const system = buildEnrichedSystemPrompt(msg.prompt, analysis);

        const routed = routeRequest({
          requestId: msg.requestId,
          userId: authed.userId,
          browserSessionId: sessionId,
          system,
          prompt: msg.prompt,
          maxOutputTokens: 8000,
          temperature: 0.4,
        });

        if (!routed) {
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

        setRequestTemplate(msg.requestId, analysis.template.id, analysis.template.name);
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
