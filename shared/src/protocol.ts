/**
 * NIT Builder v2.0 — WebSocket Protocol
 *
 * Shared types between:
 * - VPS backend (app/routes/api.tunnel.ts, app/routes/api.control.ts)
 * - Tunnel client (tunnel/src-tauri + tunnel/ui)
 * - Browser frontend (app/routes/home.tsx via WebSocket)
 *
 * Version: 1.0 — MUST be bumped on any breaking change.
 */

export const PROTOCOL_VERSION = "1.0" as const;

// ─── Common ──────────────────────────────────────────────────────

export type TunnelCapabilities = {
  /** "lmstudio_proxy" — forwards to user's LM Studio. "embedded" — built-in llama.cpp. */
  runtime: "lmstudio_proxy" | "embedded";
  /** Model identifier reported by the runtime (e.g. "qwen2.5-coder-7b-instruct") */
  model: string;
  /** Context window in tokens (e.g. 32000 for Qwen2.5) */
  contextWindow: number;
  /** Optional GPU info for diagnostic display */
  gpu?: {
    vendor: "nvidia" | "amd" | "apple" | "intel" | "cpu";
    name?: string;
    vramMb?: number;
  };
};

export type PipelineStep = "plan" | "template" | "code" | "polish" | "done";

export type GenerationMode = "create" | "polish";

// ─── Tunnel client ↔ Server ──────────────────────────────────────

/** Messages sent from tunnel client to the server */
export type TunnelToServer =
  | {
      type: "hello";
      protocolVersion: string;
      token: string;
      clientVersion: string;
      capabilities: TunnelCapabilities;
    }
  | { type: "heartbeat"; timestamp: number }
  | { type: "response_start"; requestId: string }
  | { type: "response_text"; requestId: string; text: string }
  | {
      type: "response_done";
      requestId: string;
      fullText: string;
      durationMs: number;
      promptTokens?: number;
      completionTokens?: number;
    }
  | { type: "response_error"; requestId: string; error: string };

/** Messages sent from server to tunnel client */
export type ServerToTunnel =
  | {
      type: "welcome";
      serverVersion: string;
      userId: string;
      sessionId: string;
    }
  | { type: "heartbeat_ack"; serverTime: number }
  | {
      type: "generate";
      requestId: string;
      system: string;
      prompt: string;
      maxOutputTokens: number;
      temperature: number;
      /** Optional override for the model name (if tunnel supports multiple) */
      model?: string;
    }
  | { type: "abort"; requestId: string }
  | {
      type: "error";
      code: "AUTH_FAILED" | "INVALID_TOKEN" | "PROTOCOL_MISMATCH" | "RATE_LIMITED";
      message: string;
    };

// ─── Browser ↔ Server ────────────────────────────────────────────

/** Messages sent from the browser (control WS) to the server */
export type BrowserToServer =
  | { type: "auth"; jwt: string }
  | {
      type: "generate";
      requestId: string;
      mode: GenerationMode;
      prompt: string;
      /** Previous site HTML if mode === "polish" */
      previousHtml?: string;
    }
  | { type: "abort"; requestId: string }
  | { type: "heartbeat" };

/** Messages sent from the server to the browser */
export type ServerToBrowser =
  | {
      type: "authed";
      userId: string;
      email: string;
      tunnelStatus: "online" | "offline";
      activeTunnels: number;
    }
  | { type: "tunnel_status"; status: "online" | "offline"; activeTunnels: number }
  | {
      type: "generate_step";
      requestId: string;
      step: PipelineStep;
      /** For "template" step: which template was selected */
      templateId?: string;
      templateName?: string;
    }
  | { type: "generate_text"; requestId: string; text: string }
  | {
      type: "generate_done";
      requestId: string;
      html: string;
      templateId: string;
      templateName: string;
      durationMs: number;
    }
  | {
      type: "generate_error";
      requestId: string;
      error: string;
      code?:
        | "NO_TUNNEL"
        | "TUNNEL_DISCONNECTED"
        | "LLM_ERROR"
        | "TIMEOUT"
        | "RATE_LIMITED";
    }
  | { type: "heartbeat_ack" };

// ─── Type guards ─────────────────────────────────────────────────

export function isTunnelToServer(msg: unknown): msg is TunnelToServer {
  return typeof msg === "object" && msg !== null && "type" in msg;
}

export function isBrowserToServer(msg: unknown): msg is BrowserToServer {
  return typeof msg === "object" && msg !== null && "type" in msg;
}
