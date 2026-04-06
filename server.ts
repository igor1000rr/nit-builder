/**
 * NIT Builder v2.0 — Custom production server
 *
 * Runs via tsx (not plain node) because we import TypeScript WebSocket
 * handlers directly from app/ source. This avoids bundling complexity.
 *
 * Architecture:
 * - Single HTTP server on PORT (default 3000)
 * - HTTP requests → React Router SSR handler
 * - WebSocket /api/tunnel → desktop clients
 * - WebSocket /api/control → browser sessions
 *
 * Usage:
 *   Dev:  npm run start
 *   PM2:  pm2 start ecosystem.config.cjs
 */

import { createRequestListener } from "@react-router/node";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import * as build from "./build/server/index.js";
import {
  handleTunnelConnection,
  handleControlConnection,
} from "./app/lib/server/wsHandlers.server.ts";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const NODE_ENV = (process.env.NODE_ENV ?? "production") as "development" | "production";

const requestListener = createRequestListener({
  build: build as never,
  mode: NODE_ENV,
});

const httpServer = createServer(requestListener);

const tunnelWss = new WebSocketServer({ noServer: true });
const controlWss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/tunnel") {
    tunnelWss.handleUpgrade(req, socket, head, (ws) => {
      handleTunnelConnection(ws as never, req);
    });
    return;
  }

  if (url.pathname === "/api/control") {
    controlWss.handleUpgrade(req, socket, head, (ws) => {
      handleControlConnection(ws as never, req);
    });
    return;
  }

  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

httpServer.listen(PORT, HOST, () => {
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│  NIT Builder v2.0.0-alpha.0                     │");
  console.log("│  HTTP + WebSocket server                        │");
  console.log("├─────────────────────────────────────────────────┤");
  console.log(`│  Mode:       ${NODE_ENV}`);
  console.log(`│  HTTP:       http://${HOST}:${PORT}`);
  console.log(`│  WS tunnel:  ws://${HOST}:${PORT}/api/tunnel`);
  console.log(`│  WS control: ws://${HOST}:${PORT}/api/control`);
  console.log("└─────────────────────────────────────────────────┘");
});

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} received, shutting down...`);

  tunnelWss.close();
  controlWss.close();

  httpServer.close((err) => {
    if (err) {
      console.error("[server] Shutdown error:", err);
      process.exit(1);
    }
    console.log("[server] Closed cleanly");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[server] Forced shutdown after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
