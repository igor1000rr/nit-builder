//! WebSocket protocol types — Rust mirror of @nit/shared/src/protocol.ts
//!
//! Must stay in sync with the TypeScript version. When bumping protocol
//! version on the server, update PROTOCOL_VERSION here too.

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: &str = "1.0";
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");

// ─── Capabilities ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Runtime {
    LmstudioProxy,
    Embedded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Apple,
    Intel,
    Cpu,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: GpuVendor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "vramMb", skip_serializing_if = "Option::is_none")]
    pub vram_mb: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelCapabilities {
    pub runtime: Runtime,
    pub model: String,
    #[serde(rename = "contextWindow")]
    pub context_window: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<GpuInfo>,
}

// ─── Tunnel → Server messages ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TunnelToServer {
    Hello {
        #[serde(rename = "protocolVersion")]
        protocol_version: String,
        token: String,
        #[serde(rename = "clientVersion")]
        client_version: String,
        capabilities: TunnelCapabilities,
    },
    Heartbeat {
        timestamp: u64,
    },
    ResponseStart {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    ResponseText {
        #[serde(rename = "requestId")]
        request_id: String,
        text: String,
    },
    ResponseDone {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "fullText")]
        full_text: String,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        #[serde(rename = "promptTokens", skip_serializing_if = "Option::is_none")]
        prompt_tokens: Option<u32>,
        #[serde(rename = "completionTokens", skip_serializing_if = "Option::is_none")]
        completion_tokens: Option<u32>,
    },
    ResponseError {
        #[serde(rename = "requestId")]
        request_id: String,
        error: String,
    },
}

// ─── Server → Tunnel messages ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerErrorCode {
    AuthFailed,
    InvalidToken,
    ProtocolMismatch,
    RateLimited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerToTunnel {
    Welcome {
        #[serde(rename = "serverVersion")]
        server_version: String,
        #[serde(rename = "userId")]
        user_id: String,
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    HeartbeatAck {
        #[serde(rename = "serverTime")]
        server_time: u64,
    },
    Generate {
        #[serde(rename = "requestId")]
        request_id: String,
        system: String,
        prompt: String,
        #[serde(rename = "maxOutputTokens")]
        max_output_tokens: u32,
        temperature: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    Abort {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    Error {
        code: ServerErrorCode,
        message: String,
    },
}
