/**
 * NIT Builder v2.0 — Custom production server
 *
 * Runs via tsx (not plain node) because we import TypeScript WebSocket
 * handlers directly from app/ source. This avoids bundling complexity.
 *
 * Architecture:
 * - Single HTTP server on PORT (default 3000)
 * - Static files из build/client/ + public/ (раздаются ДО React Router)
 * - HTTP requests → React Router SSR handler
 * - WebSocket /api/tunnel → desktop clients
 * - WebSocket /api/control → browser sessions
 *
 * Usage:
 *   Dev:  npm run start
 *   PM2:  pm2 start ecosystem.config.cjs
 */

import { createRequestListener } from "@react-router/node";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  handleTunnelConnection,
  handleControlConnection,
} from "./app/lib/server/wsHandlers.server.ts";

// Dynamic import for build — avoids typecheck needing prior build
// @ts-expect-error — build output exists at runtime after `npm run build`
const build = await import("./build/server/index.js");

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const NODE_ENV = (process.env.NODE_ENV ?? "production") as "development" | "production";

const requestListener = createRequestListener({
  build: build as never,
  mode: NODE_ENV,
});

// ─── Static file middleware ───────────────────────────────────────
//
// createRequestListener НЕ умеет раздавать статику — он только SSR.
// Без этого middleware hashed-бандлы (/assets/root-*.css, /assets/*.js)
// возвращают 404 и сайт выглядит unstyled.
//
// Раздаём из двух корней:
//   1. build/client/assets/ — hashed bundles (immutable, кэш год)
//   2. build/client/         — favicon.svg, og-image.svg, etc (короткий кэш)
//   3. public/               — robots.txt, sitemap.xml fallback
//
// Path traversal защищён через normalize + startsWith проверку.

const CLIENT_DIR = join(__dirname, "build", "client");
const PUBLIC_DIR = join(__dirname, "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".txt":  "text/plain; charset=utf-8",
  ".xml":  "application/xml; charset=utf-8",
  ".map":  "application/json; charset=utf-8",
};

function tryServeFile(
  root: string,
  pathname: string,
  res: ServerResponse,
  immutable: boolean,
): boolean {
  // Защита от path traversal: нормализуем и проверяем что результат
  // остаётся внутри root. Без этого `/assets/../../etc/passwd` уйдёт.
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root + sep) && filePath !== root) return false;

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  );

  createReadStream(filePath).pipe(res);
  return true;
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // 1. Hashed bundles: /assets/* — immutable cache
  if (pathname.startsWith("/assets/")) {
    if (tryServeFile(CLIENT_DIR, pathname, res, true)) return;
  }

  // 2. Остальные client-статики (favicon, og-image, robots, sitemap)
  //    — короткий кэш, но только если реально существуют
  if (pathname !== "/" && !pathname.startsWith("/api/")) {
    if (tryServeFile(CLIENT_DIR, pathname, res, false)) return;
    if (tryServeFile(PUBLIC_DIR, pathname, res, false)) return;
  }

  // 3. Fallback — React Router SSR
  requestListener(req, res);
}

const httpServer = createServer(handleHttp);

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
