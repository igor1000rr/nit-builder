/**
 * TypeScript types mirroring Rust types in src-tauri/src/tunnel.rs.
 * Keep in sync when changing Rust side.
 */

export type TunnelStatus =
  | { status: "idle" }
  | { status: "probing_lm_studio" }
  | { status: "connecting" }
  | { status: "connected"; user_id: string; model: string }
  | { status: "disconnected"; reason: string; retry_in_seconds: number }
  | { status: "auth_failed"; reason: string }
  | { status: "lm_studio_unreachable"; reason: string };

export type TunnelUiEvent =
  | { type: "status_changed"; content: TunnelStatus }
  | { type: "request_started"; request_id: string }
  | { type: "request_progress"; request_id: string; tokens: number }
  | { type: "request_completed"; request_id: string; duration_ms: number }
  | { type: "request_failed"; request_id: string; error: string }
  | { type: "log"; content: string };

export type StartTunnelPayload = {
  server_url: string;
  token: string;
  lm_studio_url: string;
};

export type StartTunnelResult = {
  ok: boolean;
  error: string | null;
};

export type LmStudioProbeResult = {
  available: boolean;
  model: string | null;
  error: string | null;
};
