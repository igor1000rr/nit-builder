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

const SERVER_VERSION = "2.0.0-alpha.0" as const;

// ─── Auth stub (Phase A) ──────────────────────────────────────────
// In Phase B this will be replaced with real Appwrite token validation.
// For now we use a dev token from env.

function validateTunnelToken(token: string): { userId: string } | null {
  const devToken = process.env.NIT_DEV_TUNNEL_TOKEN;
  if (devToken && token === devToken) {
    return { userId: "dev-user" };
  }
  // TODO Phase B: Appwrite lookup
  return null;
}

function validateBrowserSession(jwt: string): { userId: string; email: string } | null {
  // Phase A: accept any non-empty string, map to dev-user
  if (jwt === "dev-session") {
    return { userId: "dev-user", email: "dev@local" };
  }
  // TODO Phase B: Appwrite JWT validation
  return null;
}

// ─── Tunnel handler (desktop client → server) ────────────────────

export function handleTunnelConnection(ws: WebSocket, req: IncomingMessage): void {
  const connectionId = randomUUID();
  let authed: TunnelConnection | null = null;

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

        const user = validateTunnelToken(msg.token);
        if (!user) {
          closeWithError("INVALID_TOKEN", "Invalid tunnel token");
          return;
        }

        clearTimeout(authTimer);

        authed = {
          connectionId,
          userId: user.userId,
          ws,
          capabilities: msg.capabilities,
          clientVersion: msg.clientVersion,
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
          `[tunnel] ✓ Connected: user=${user.userId} client=${msg.clientVersion} runtime=${msg.capabilities.runtime} model=${msg.capabilities.model}`,
        );
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

        const user = validateBrowserSession(msg.jwt);
        if (!user) {
          ws.close(4001, "Auth failed");
          return;
        }

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
        console.log(`[control] ✓ Browser authed: user=${user.userId} session=${sessionId}`);
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
          send({
            type: "generate_error",
            requestId: msg.requestId,
            error: "No tunnel connected. Install NIT Tunnel on a device with a GPU.",
            code: "NO_TUNNEL",
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
