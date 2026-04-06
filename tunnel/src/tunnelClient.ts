/**
 * NIT Tunnel client — connects to the VPS and proxies generation requests to
 * a local LM Studio instance.
 *
 * Protocol: see shared/src/protocol.ts
 *
 * Lifecycle:
 * 1. Probe LM Studio at localhost:1234
 * 2. Connect to wss://<server>/api/tunnel
 * 3. Send hello with capabilities
 * 4. Receive welcome
 * 5. On each `generate` message: stream from LM Studio, forward events
 * 6. Heartbeat every 15s
 * 7. On disconnect: reconnect after 5s with exponential backoff up to 60s
 */

import { WebSocket } from "ws";
import type {
  TunnelToServer,
  ServerToTunnel,
  TunnelCapabilities,
} from "@nit/shared";
import { PROTOCOL_VERSION } from "@nit/shared";
import { streamFromLmStudio, probeLmStudio } from "./lmStudioProxy.js";

const CLIENT_VERSION = "0.1.0-alpha" as const;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_INITIAL_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
const LLM_TIMEOUT_MS = 5 * 60_000; // 5 minutes for generation

export type TunnelConfig = {
  serverUrl: string; // e.g. "wss://nit.vibecoding.by/api/tunnel"
  token: string;
  lmStudioUrl: string; // e.g. "http://localhost:1234/v1"
  verbose?: boolean;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
};

function makeLogger(verbose: boolean): Logger {
  const ts = () => new Date().toLocaleTimeString();
  return {
    info: (msg) => console.log(`[${ts()}] ${msg}`),
    warn: (msg) => console.log(`[${ts()}] ⚠ ${msg}`),
    error: (msg) => console.error(`[${ts()}] ✗ ${msg}`),
    debug: (msg) => verbose && console.log(`[${ts()}] · ${msg}`),
  };
}

export async function runTunnel(config: TunnelConfig): Promise<void> {
  const log = makeLogger(config.verbose ?? false);
  let reconnectDelay = RECONNECT_INITIAL_MS;
  let shutdownRequested = false;

  process.on("SIGINT", () => {
    log.info("Shutting down tunnel...");
    shutdownRequested = true;
    process.exit(0);
  });

  while (!shutdownRequested) {
    try {
      // Step 1: probe LM Studio
      log.info(`Checking LM Studio at ${config.lmStudioUrl}...`);
      const probe = await probeLmStudio(config.lmStudioUrl);
      if (!probe.available) {
        log.error(`LM Studio not reachable: ${probe.error}`);
        log.info("Make sure LM Studio is running and the local server is started.");
        log.info(`Retrying in ${reconnectDelay / 1000}s...`);
        await sleep(reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        continue;
      }
      log.info(`✓ LM Studio online, model: ${probe.model ?? "unknown"}`);

      // Step 2: connect to server
      log.info(`Connecting to ${config.serverUrl}...`);
      await connectAndServe(config, probe.model ?? "unknown", log);

      // If connectAndServe returns normally, server closed gracefully
      reconnectDelay = RECONNECT_INITIAL_MS;
    } catch (err) {
      log.error(`Connection error: ${(err as Error).message}`);
    }

    if (!shutdownRequested) {
      log.info(`Reconnecting in ${reconnectDelay / 1000}s...`);
      await sleep(reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    }
  }
}

async function connectAndServe(
  config: TunnelConfig,
  model: string,
  log: Logger,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(config.serverUrl);

    const capabilities: TunnelCapabilities = {
      runtime: "lmstudio_proxy",
      model,
      contextWindow: 32_000, // Qwen2.5 default; TODO: detect from /v1/models metadata
    };

    const activeAborts = new Map<string, AbortController>();
    let heartbeatTimer: NodeJS.Timeout | null = null;

    ws.on("open", () => {
      log.info("✓ Connected, sending hello...");
      const hello: TunnelToServer = {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        token: config.token,
        clientVersion: CLIENT_VERSION,
        capabilities,
      };
      ws.send(JSON.stringify(hello));

      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "heartbeat",
              timestamp: Date.now(),
            } satisfies TunnelToServer),
          );
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.on("message", async (raw) => {
      let msg: ServerToTunnel;
      try {
        msg = JSON.parse(raw.toString()) as ServerToTunnel;
      } catch {
        log.warn("Received malformed message from server, ignoring");
        return;
      }

      switch (msg.type) {
        case "welcome":
          log.info(`✓ Authenticated as user ${msg.userId} (server ${msg.serverVersion})`);
          log.info("Ready to generate.");
          break;

        case "heartbeat_ack":
          // Silent — just keeps connection alive
          break;

        case "generate": {
          log.info(`→ Generation request ${msg.requestId.slice(0, 8)}...`);
          const abortCtrl = new AbortController();
          activeAborts.set(msg.requestId, abortCtrl);

          try {
            await handleGenerate(ws, msg, config.lmStudioUrl, model, abortCtrl.signal, log);
          } finally {
            activeAborts.delete(msg.requestId);
          }
          break;
        }

        case "abort": {
          log.info(`← Abort request ${msg.requestId.slice(0, 8)}`);
          activeAborts.get(msg.requestId)?.abort();
          activeAborts.delete(msg.requestId);
          break;
        }

        case "error":
          log.error(`Server error [${msg.code}]: ${msg.message}`);
          if (msg.code === "AUTH_FAILED" || msg.code === "INVALID_TOKEN") {
            ws.close();
            reject(new Error(`Auth failed: ${msg.message}`));
            return;
          }
          break;
      }
    });

    ws.on("close", (code, reason) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      // Abort any in-flight generations
      for (const ctrl of activeAborts.values()) ctrl.abort();
      activeAborts.clear();

      log.info(`Connection closed: ${code} ${reason.toString()}`);
      resolve();
    });

    ws.on("error", (err) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      log.error(`WebSocket error: ${err.message}`);
      reject(err);
    });
  });
}

async function handleGenerate(
  ws: WebSocket,
  req: Extract<ServerToTunnel, { type: "generate" }>,
  lmStudioUrl: string,
  model: string,
  signal: AbortSignal,
  log: Logger,
): Promise<void> {
  const startedAt = Date.now();

  const send = (msg: TunnelToServer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  send({ type: "response_start", requestId: req.requestId });

  let fullText = "";
  let tokenCount = 0;

  try {
    const stream = streamFromLmStudio(
      {
        baseUrl: lmStudioUrl,
        model: req.model ?? model,
        timeoutMs: LLM_TIMEOUT_MS,
      },
      {
        system: req.system,
        prompt: req.prompt,
        maxTokens: req.maxOutputTokens,
        temperature: req.temperature,
        signal,
      },
    );

    for await (const delta of stream) {
      if (signal.aborted) break;

      if (delta.type === "text" && delta.text) {
        fullText += delta.text;
        tokenCount++;
        send({
          type: "response_text",
          requestId: req.requestId,
          text: delta.text,
        });
      } else if (delta.type === "done") {
        send({
          type: "response_done",
          requestId: req.requestId,
          fullText: delta.fullText ?? fullText,
          durationMs: delta.durationMs ?? Date.now() - startedAt,
          completionTokens: tokenCount,
        });
        log.info(
          `✓ Completed ${req.requestId.slice(0, 8)} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${tokenCount} chunks`,
        );
        return;
      } else if (delta.type === "error") {
        send({
          type: "response_error",
          requestId: req.requestId,
          error: delta.error ?? "Unknown LLM error",
        });
        log.error(`Request ${req.requestId.slice(0, 8)} failed: ${delta.error}`);
        return;
      }
    }

    if (signal.aborted) {
      send({
        type: "response_error",
        requestId: req.requestId,
        error: "Request aborted",
      });
    }
  } catch (err) {
    send({
      type: "response_error",
      requestId: req.requestId,
      error: (err as Error).message,
    });
    log.error(`Request ${req.requestId.slice(0, 8)} threw: ${(err as Error).message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
